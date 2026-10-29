# Aura Code - observador de música para Windows.
# Emite líneas JSON por stdout:
#   {"t":"l","v":0.42}                      nivel de audio (pico) de la salida por defecto
#   {"t":"s","v":[0..100, ...]}             espectro (barras del visualizador, graves -> agudos)
#   {"t":"track",...}                       metadatos de la canción (Windows Media Controls)
#   {"t":"pos","p":61.2,"d":180,"u":...}    posición y duración en segundos (u = cuándo se midió, ms epoch)
#   {"t":"art","mime":"image/png","b64":..} carátula del álbum
#   {"t":"error","where":...,"msg":...}
# Lee órdenes por stdin, una por línea: playpause | next | prev | ping (responde {"t":"pong"})
param([int]$IntervalMs = 40, [int]$Bands = 48)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$inv = [Globalization.CultureInfo]::InvariantCulture

function Emit($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 3))
    [Console]::Out.Flush()
}

# --- Audio nativo: medidor de pico, espectro (captura loopback + FFT) y órdenes por stdin ---
$audioOk = $true
try {
    Add-Type -TypeDefinition @"
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class AuraMMDeviceEnumerator {}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAuraMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IAuraMMDevice endpoint);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAuraMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
}

[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAuraAudioMeterInformation {
    int GetPeakValue(out float peak);
}

[Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAuraAudioClient {
    int Initialize(int shareMode, uint streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
    int GetBufferSize(out uint frames);
    int GetStreamLatency(out long latency);
    int GetCurrentPadding(out uint padding);
    int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
    int GetMixFormat(out IntPtr format);
    int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
    int Start();
    int Stop();
    int Reset();
    int SetEventHandle(IntPtr handle);
    int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
}

[Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAuraAudioCaptureClient {
    int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
    int ReleaseBuffer(uint frames);
    int GetNextPacketSize(out uint frames);
}

public static class AuraMeter {
    static IAuraAudioMeterInformation meter;

    public static float Peak() {
        if (meter == null) {
            var enumerator = (IAuraMMDeviceEnumerator)new AuraMMDeviceEnumerator();
            IAuraMMDevice device;
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
            Guid iid = typeof(IAuraAudioMeterInformation).GUID;
            object o;
            Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out o));
            meter = (IAuraAudioMeterInformation)o;
        }
        float peak;
        Marshal.ThrowExceptionForHR(meter.GetPeakValue(out peak));
        return peak;
    }

    public static void Reset() { meter = null; }
}

/// Captura lo que suena en la salida por defecto (loopback de WASAPI) y calcula barras por frecuencia.
public static class AuraSpectrum {
    const int FFT = 2048;
    static readonly Guid FloatFormat = new Guid("00000003-0000-0010-8000-00aa00389b71");
    static volatile bool running;
    static float[] bands = new float[0];
    static readonly object gate = new object();
    public static string LastError = "";

    public static void Start(int count) {
        if (running) return;
        bands = new float[count];
        running = true;
        var t = new Thread(Loop);
        t.IsBackground = true;
        t.Start();
    }

    public static int[] Bands() {
        lock (gate) {
            var r = new int[bands.Length];
            for (int i = 0; i < r.Length; i++) r[i] = (int)Math.Round(Math.Min(1f, bands[i]) * 100);
            return r;
        }
    }

    static void Loop() {
        while (running) {
            try { Capture(); }
            catch (Exception e) { LastError = e.Message; Thread.Sleep(2000); }
        }
    }

    static void Capture() {
        var enumerator = (IAuraMMDeviceEnumerator)new AuraMMDeviceEnumerator();
        IAuraMMDevice device;
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
        Guid iid = typeof(IAuraAudioClient).GUID;
        object o;
        Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out o));
        var client = (IAuraAudioClient)o;

        IntPtr fmt;
        Marshal.ThrowExceptionForHR(client.GetMixFormat(out fmt));
        int tag = (ushort)Marshal.ReadInt16(fmt, 0);
        int channels = Marshal.ReadInt16(fmt, 2);
        int rate = Marshal.ReadInt32(fmt, 4);
        int bits = Marshal.ReadInt16(fmt, 14);
        bool isFloat = tag == 3;
        if (tag == 0xFFFE) {
            var g = new byte[16];
            Marshal.Copy(fmt + 24, g, 0, 16);
            isFloat = new Guid(g) == FloatFormat;
        }
        if (!isFloat && bits != 16) throw new Exception("Formato de audio no soportado: " + bits + " bits");

        // 0x00020000 = AUDCLNT_STREAMFLAGS_LOOPBACK; búfer de 1 s.
        Marshal.ThrowExceptionForHR(client.Initialize(0, 0x00020000, 10000000, 0, fmt, IntPtr.Zero));
        Guid cid = typeof(IAuraAudioCaptureClient).GUID;
        object co;
        Marshal.ThrowExceptionForHR(client.GetService(ref cid, out co));
        var capture = (IAuraAudioCaptureClient)co;
        Marshal.ThrowExceptionForHR(client.Start());

        var ring = new float[FFT];
        int pos = 0;
        var floats = new float[0];
        var shorts = new short[0];
        var clock = Stopwatch.StartNew();
        long lastFft = 0, lastData = 0;
        try {
            // Se reinicia cada 10 s para seguir cambios de dispositivo (audífonos, bocinas...).
            while (running && clock.ElapsedMilliseconds < 10000) {
                Thread.Sleep(10);
                uint packet;
                Marshal.ThrowExceptionForHR(capture.GetNextPacketSize(out packet));
                while (packet > 0) {
                    IntPtr data; uint frames, flags; ulong p1, p2;
                    Marshal.ThrowExceptionForHR(capture.GetBuffer(out data, out frames, out flags, out p1, out p2));
                    int n = (int)frames * channels;
                    bool silent = (flags & 2) != 0;
                    if (isFloat) {
                        if (floats.Length < n) floats = new float[n];
                        if (!silent) Marshal.Copy(data, floats, 0, n);
                    } else {
                        if (shorts.Length < n) shorts = new short[n];
                        if (!silent) Marshal.Copy(data, shorts, 0, n);
                    }
                    for (int f = 0; f < frames; f++) {
                        float s = 0;
                        if (!silent) {
                            for (int c = 0; c < channels; c++) {
                                s += isFloat ? floats[f * channels + c] : shorts[f * channels + c] / 32768f;
                            }
                            s /= channels;
                        }
                        ring[pos] = s;
                        pos = (pos + 1) % FFT;
                    }
                    capture.ReleaseBuffer(frames);
                    lastData = clock.ElapsedMilliseconds;
                    Marshal.ThrowExceptionForHR(capture.GetNextPacketSize(out packet));
                }
                // En silencio Windows no entrega paquetes: rellenamos con ceros para que las barras bajen.
                if (clock.ElapsedMilliseconds - lastData > 60) {
                    int zeros = rate / 100;
                    for (int i = 0; i < zeros; i++) { ring[pos] = 0; pos = (pos + 1) % FFT; }
                }
                if (clock.ElapsedMilliseconds - lastFft >= 30) {
                    lastFft = clock.ElapsedMilliseconds;
                    Analyze(ring, pos, rate);
                }
            }
        } finally {
            client.Stop();
            Marshal.FreeCoTaskMem(fmt);
            Marshal.ReleaseComObject(capture);
            Marshal.ReleaseComObject(client);
        }
    }

    static void Analyze(float[] ring, int pos, int rate) {
        var re = new double[FFT];
        var im = new double[FFT];
        for (int i = 0; i < FFT; i++) {
            double w = 0.5 - 0.5 * Math.Cos(2 * Math.PI * i / (FFT - 1)); // ventana de Hann
            re[i] = ring[(pos + i) % FFT] * w;
        }
        Fft(re, im);

        int count = bands.Length;
        var next = new float[count];
        double lo = 45, hi = Math.Min(16000, rate / 2.0);
        int prevK1 = 1;
        for (int b = 0; b < count; b++) {
            double f0 = lo * Math.Pow(hi / lo, (double)b / count);
            double f1 = lo * Math.Pow(hi / lo, (double)(b + 1) / count);
            // Cada barra empieza donde terminó la anterior: en los graves las bandas son más finas
            // que la resolución de la FFT y, si no, varias barras repetirían la misma frecuencia.
            int k0 = Math.Max(prevK1, (int)(f0 * FFT / rate));
            int k1 = Math.Max(k0 + 1, (int)(f1 * FFT / rate));
            prevK1 = k1;
            double max = 0;
            for (int k = k0; k < k1 && k < FFT / 2; k++) {
                double m = Math.Sqrt(re[k] * re[k] + im[k] * im[k]);
                if (m > max) max = m;
            }
            double db = 20 * Math.Log10(max / (FFT / 4.0) + 1e-9);
            // Los agudos tienen menos energía: se compensan un poco para que la barra se vea pareja.
            db += 6.0 * b / count;
            next[b] = (float)Math.Max(0, Math.Min(1, (db + 62) / 56));
        }
        lock (gate) {
            for (int b = 0; b < count; b++) {
                // Subida inmediata, bajada suave.
                bands[b] = Math.Max(next[b], bands[b] * 0.82f);
            }
        }
    }

    static void Fft(double[] re, double[] im) {
        int n = re.Length;
        for (int i = 1, j = 0; i < n; i++) {
            int bit = n >> 1;
            for (; (j & bit) != 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) {
                double t = re[i]; re[i] = re[j]; re[j] = t;
                t = im[i]; im[i] = im[j]; im[j] = t;
            }
        }
        for (int len = 2; len <= n; len <<= 1) {
            double ang = -2 * Math.PI / len;
            double wr = Math.Cos(ang), wi = Math.Sin(ang);
            for (int i = 0; i < n; i += len) {
                double cr = 1, ci = 0;
                for (int j = 0; j < len / 2; j++) {
                    int a = i + j, b = i + j + len / 2;
                    double xr = re[b] * cr - im[b] * ci;
                    double xi = re[b] * ci + im[b] * cr;
                    re[b] = re[a] - xr; im[b] = im[a] - xi;
                    re[a] += xr; im[a] += xi;
                    double t = cr * wr - ci * wi;
                    ci = cr * wi + ci * wr;
                    cr = t;
                }
            }
        }
    }
}

/// Lee órdenes de stdin en segundo plano (el bucle principal no puede bloquearse esperando).
public static class AuraInput {
    static readonly ConcurrentQueue<string> queue = new ConcurrentQueue<string>();

    public static void Start() {
        var t = new Thread(() => {
            try {
                string line;
                while ((line = Console.In.ReadLine()) != null) queue.Enqueue(line.Trim());
            } catch { }
        });
        t.IsBackground = true;
        t.Start();
    }

    public static string Next() {
        string s;
        return queue.TryDequeue(out s) ? s : null;
    }
}
"@
    [AuraSpectrum]::Start($Bands)
    [AuraInput]::Start()
} catch {
    $audioOk = $false
    Emit @{ t = 'error'; where = 'audio'; msg = $_.Exception.Message }
}

# --- Windows Media Controls (título, artista, carátula, controles) ------------
$smtcOk = $true
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
    $asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
    $asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))

    function Await($op, [Type]$type) {
        $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
        if (-not $task.Wait(3000)) { return $null }
        return $task.Result
    }

    $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch {
    $smtcOk = $false
    Emit @{ t = 'error'; where = 'smtc'; msg = $_.Exception.Message }
}

function Read-Art($props) {
    if ($null -eq $props.Thumbnail) { return $null }
    $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if ($null -eq $stream) { return $null }
    # Invocado por reflexión: PowerShell no logra enlazar el objeto COM a IInputStream directamente.
    $net = $asStreamForRead.Invoke($null, @($stream))
    try {
        $ms = New-Object System.IO.MemoryStream
        $net.CopyTo($ms)
        if ($ms.Length -eq 0) { return $null }
        $mime = $stream.ContentType
        if ([string]::IsNullOrEmpty($mime)) { $mime = 'image/jpeg' }
        return @{ t = 'art'; mime = $mime; b64 = [Convert]::ToBase64String($ms.ToArray()) }
    } finally {
        $net.Dispose()
    }
}

function Invoke-Command-Line($cmd) {
    if ($cmd -eq 'ping') { Emit @{ t = 'pong' }; return }
    if (-not $smtcOk -or $null -eq $mgr) { return }
    $session = $mgr.GetCurrentSession()
    if ($null -eq $session) { return }
    $op = switch ($cmd) {
        'playpause' { $session.TryTogglePlayPauseAsync() }
        'next' { $session.TrySkipNextAsync() }
        'prev' { $session.TrySkipPreviousAsync() }
        default { $null }
    }
    if ($null -ne $op) { $null = Await $op ([bool]) }
}

# --- Bucle principal -----------------------------------------------------------
$sw = [Diagnostics.Stopwatch]::StartNew()
$lastLevel = -1.0
$lastMedia = -100000
$lastMeterReset = 0
$lastKey = $null
$lastTrackKey = $null
$lastPos = ''
$lastSpectrum = ''
$artPending = 0
$epoch = [DateTimeOffset]::new(1970, 1, 1, 0, 0, 0, [TimeSpan]::Zero)

while ($true) {
    $now = $sw.ElapsedMilliseconds

    if ($audioOk) {
        # Órdenes de la extensión (botones del reproductor).
        while ($null -ne ($cmd = [AuraInput]::Next())) {
            try { Invoke-Command-Line $cmd; $lastMedia = -100000 } catch { Emit @{ t = 'error'; where = 'cmd'; msg = $_.Exception.Message } }
        }

        # Re-adquiere el medidor cada 5 s para seguir cambios de salida (audífonos, bocinas...).
        if ($now - $lastMeterReset -gt 5000) { [AuraMeter]::Reset(); $lastMeterReset = $now }
        try {
            $p = [Math]::Round([double][AuraMeter]::Peak(), 3)
            if ([Math]::Abs($p - $lastLevel) -ge 0.01 -or ($p -eq 0 -and $lastLevel -ne 0)) {
                [Console]::Out.WriteLine('{"t":"l","v":' + $p.ToString('0.000', $inv) + '}')
                $lastLevel = $p
            }
        } catch {
            [AuraMeter]::Reset()
        }

        $spectrum = [string]::Join(',', [AuraSpectrum]::Bands())
        if ($spectrum -ne $lastSpectrum) {
            [Console]::Out.WriteLine('{"t":"s","v":[' + $spectrum + ']}')
            $lastSpectrum = $spectrum
        }
        [Console]::Out.Flush()
    }

    if ($smtcOk -and $null -ne $mgr -and ($now - $lastMedia -gt 1000)) {
        $lastMedia = $now
        try {
            $session = $mgr.GetCurrentSession()
            if ($null -eq $session) {
                if ($lastKey -ne '') {
                    $lastKey = ''
                    $lastTrackKey = $null
                    Emit @{ t = 'track'; playing = $false; title = ''; artist = ''; album = ''; app = '' }
                }
            } else {
                $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
                $status = $session.GetPlaybackInfo().PlaybackStatus.ToString()
                if ($null -ne $props) {
                    $trackKey = "$($props.Title)|$($props.Artist)"
                    $key = "$trackKey|$status"
                    if ($key -ne $lastKey) {
                        $lastKey = $key
                        Emit @{
                            t       = 'track'
                            playing = ($status -eq 'Playing')
                            title   = [string]$props.Title
                            artist  = [string]$props.Artist
                            album   = [string]$props.AlbumTitle
                            app     = [string]$session.SourceAppUserModelId
                        }
                    }
                    if ($trackKey -ne $lastTrackKey) {
                        $lastTrackKey = $trackKey
                        $artPending = 3
                    }
                    # Algunas apps publican la carátula unos segundos después del cambio de canción.
                    if ($artPending -gt 0) {
                        $artPending--
                        $art = Read-Art $props
                        if ($null -ne $art) { Emit $art; $artPending = 0 }
                    }

                    $tl = $session.GetTimelineProperties()
                    $dur = ($tl.EndTime - $tl.StartTime).TotalSeconds
                    if ($dur -gt 0) {
                        $posJson = '{"t":"pos","p":' + $tl.Position.TotalSeconds.ToString('0.0', $inv) +
                            ',"d":' + $dur.ToString('0.0', $inv) +
                            ',"u":' + [long]($tl.LastUpdatedTime - $epoch).TotalMilliseconds + '}'
                        if ($posJson -ne $lastPos) {
                            [Console]::Out.WriteLine($posJson)
                            [Console]::Out.Flush()
                            $lastPos = $posJson
                        }
                    }
                }
            }
        } catch {
            Emit @{ t = 'error'; where = 'track'; msg = $_.Exception.Message }
        }
    }

    Start-Sleep -Milliseconds $IntervalMs
}
