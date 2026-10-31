# Aura Code - observador de música para Windows.
# Emite líneas JSON por stdout:
#   {"t":"l","v":0.42}                      nivel de audio (pico) de la salida por defecto
#   {"t":"s","v":[0..100, ...]}             espectro (barras del visualizador, graves -> agudos)
#   {"t":"track",...}                       metadatos de la canción (Windows Media Controls)
#   {"t":"pos","p":61.2,"d":180,"u":...}    posición y duración en segundos (u = cuándo se midió, ms epoch)
#   {"t":"art","mime":"image/png","b64":..} carátula del álbum
#   {"t":"error","where":...,"msg":...}
# Lee órdenes por stdin, una por línea: playpause | next | prev | ping (responde {"t":"pong"})
#
# Cada pieza (órdenes, medidor, espectro, metadatos) se carga por separado: si una falla en un equipo
# (antivirus, políticas, drivers de audio raros), las demás siguen funcionando.
param([int]$IntervalMs = 25, [int]$Bands = 48, [switch]$NoSpectrum)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$inv = [Globalization.CultureInfo]::InvariantCulture

function Emit($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 3))
    [Console]::Out.Flush()
}

# --- Órdenes por stdin (botones del reproductor) -------------------------------
$inputOk = $true
try {
    Add-Type -TypeDefinition @"
using System;
using System.Collections.Concurrent;
using System.Threading;

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
    [AuraInput]::Start()
} catch {
    $inputOk = $false
    Emit @{ t = 'error'; where = 'input'; msg = $_.Exception.Message }
}

# --- Medidor de pico (Core Audio) ---------------------------------------------
$meterOk = $true
try {
    Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAuraMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IAuraMMDeviceCollection devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IAuraMMDevice endpoint);
}

[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAuraMMDeviceCollection {
    int GetCount(out uint count);
    int Item(uint index, out IAuraMMDevice device);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAuraMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    int OpenPropertyStore(int access, out IntPtr store);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}

[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAuraAudioMeterInformation {
    int GetPeakValue(out float peak);
}

/// Mide el volumen de TODAS las salidas activas: la música puede sonar por un dispositivo que no es
/// el predeterminado (audífonos elegidos solo en el navegador, dispositivos virtuales, etc.).
public static class AuraMeter {
    static List<KeyValuePair<string, IAuraAudioMeterInformation>> meters;
    static string defaultId = "";
    /// Dispositivo que está sonando (el predeterminado si suena; si no, el más fuerte). Lo usa el espectro.
    public static string ActiveId = "";

    public static float Peak() {
        if (meters == null) Load();
        float best = 0, def = 0;
        string bestId = null;
        foreach (var kv in meters) {
            float p;
            if (kv.Value.GetPeakValue(out p) != 0) continue;
            if (kv.Key == defaultId) def = p;
            if (p > best) { best = p; bestId = kv.Key; }
        }
        if (def > 0.01f || bestId == null || best <= 0.01f) { ActiveId = defaultId; return def; }
        ActiveId = bestId;
        return best;
    }

    static void Load() {
        var list = new List<KeyValuePair<string, IAuraAudioMeterInformation>>();
        var enumerator = (IAuraMMDeviceEnumerator)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")));
        IAuraMMDevice def;
        if (enumerator.GetDefaultAudioEndpoint(0, 1, out def) == 0) def.GetId(out defaultId);
        IAuraMMDeviceCollection devices;
        Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(0, 1, out devices)); // salidas activas
        uint count;
        devices.GetCount(out count);
        Guid iid = typeof(IAuraAudioMeterInformation).GUID;
        for (uint i = 0; i < count; i++) {
            try {
                IAuraMMDevice device;
                if (devices.Item(i, out device) != 0) continue;
                string id;
                device.GetId(out id);
                object o;
                if (device.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) continue;
                list.Add(new KeyValuePair<string, IAuraAudioMeterInformation>(id, (IAuraAudioMeterInformation)o));
            } catch { }
        }
        meters = list;
    }

    public static void Reset() { meters = null; }
}
"@
} catch {
    $meterOk = $false
    Emit @{ t = 'error'; where = 'meter'; msg = $_.Exception.Message }
}

# --- Espectro: captura loopback (WASAPI) + FFT --------------------------------
$spectrumOk = -not $NoSpectrum
if ($spectrumOk) {
    try {
        Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAuraSpecEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IAuraSpecDevice endpoint);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IAuraSpecDevice device);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAuraSpecDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
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

/// Captura lo que suena en la salida por defecto (loopback de WASAPI) y calcula barras por frecuencia.
public static class AuraSpectrum {
    const int FFT = 2048;
    static readonly Guid FloatFormat = new Guid("00000003-0000-0010-8000-00aa00389b71");
    static volatile bool running;
    static float[] bands = new float[0];
    static readonly object gate = new object();
    /// Último error de captura ("" si funciona). Si no está vacío, el script usa el volumen como respaldo.
    public static volatile string LastError = "";
    public static volatile string Format = "";
    /// Dispositivo a capturar (id de Core Audio); vacío = salida predeterminada.
    public static volatile string TargetId = "";
    /// true = este hilo envía las barras en cuanto calcula cada FFT (sin esperar al bucle de PowerShell,
    /// que se frena al leer la canción o la carátula). El script lo apaga cuando usa el respaldo.
    public static volatile bool EmitEnabled = true;
    static string lastLine = "";

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
            catch (Exception e) { LastError = e.Message; Thread.Sleep(3000); }
        }
    }

    static void Capture() {
        // Por CLSID y no con una clase [ComImport]: el medidor ya registra una con el mismo GUID y chocarían.
        var enumerator = (IAuraSpecEnumerator)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")));
        IAuraSpecDevice device;
        string usedId = TargetId;
        if (usedId == "" || enumerator.GetDevice(usedId, out device) != 0) {
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
        }
        Guid iid = typeof(IAuraAudioClient).GUID;
        object o;
        Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out o));
        var client = (IAuraAudioClient)o;

        IntPtr fmt;
        Marshal.ThrowExceptionForHR(client.GetMixFormat(out fmt));
        int tag = (ushort)Marshal.ReadInt16(fmt, 0);
        int channels = Math.Max(1, (int)Marshal.ReadInt16(fmt, 2));
        int rate = Marshal.ReadInt32(fmt, 4);
        int blockAlign = Marshal.ReadInt16(fmt, 12);
        // Tamaño real de cada muestra en memoria (por ejemplo 24 bits válidos dentro de 32).
        int bytesPerSample = Math.Max(1, blockAlign / channels);
        bool isFloat = tag == 3;
        if (tag == 0xFFFE) {
            var g = new byte[16];
            Marshal.Copy(fmt + 24, g, 0, 16);
            isFloat = new Guid(g) == FloatFormat;
        }
        if (isFloat && bytesPerSample != 4) throw new Exception("Formato de audio no soportado: float de " + (bytesPerSample * 8) + " bits");
        if (!isFloat && bytesPerSample != 2 && bytesPerSample != 3 && bytesPerSample != 4) {
            throw new Exception("Formato de audio no soportado: PCM de " + (bytesPerSample * 8) + " bits");
        }
        Format = (isFloat ? "float" : "pcm") + (bytesPerSample * 8) + " " + channels + "ch " + rate + "Hz";

        // 0x00020000 = AUDCLNT_STREAMFLAGS_LOOPBACK; búfer de 1 s.
        Marshal.ThrowExceptionForHR(client.Initialize(0, 0x00020000, 10000000, 0, fmt, IntPtr.Zero));
        Guid cid = typeof(IAuraAudioCaptureClient).GUID;
        object co;
        Marshal.ThrowExceptionForHR(client.GetService(ref cid, out co));
        var capture = (IAuraAudioCaptureClient)co;
        Marshal.ThrowExceptionForHR(client.Start());
        LastError = "";

        var ring = new float[FFT];
        int pos = 0;
        var raw = new byte[0];
        var clock = Stopwatch.StartNew();
        long lastFft = 0, lastData = 0;
        try {
            // Se reinicia cada 10 s para seguir cambios de dispositivo (audífonos, bocinas...).
            // También se reinicia si la música pasa a sonar por otro dispositivo.
            while (running && clock.ElapsedMilliseconds < 10000 && usedId == TargetId) {
                Thread.Sleep(10);
                uint packet;
                Marshal.ThrowExceptionForHR(capture.GetNextPacketSize(out packet));
                while (packet > 0) {
                    IntPtr data; uint frames, flags; ulong p1, p2;
                    Marshal.ThrowExceptionForHR(capture.GetBuffer(out data, out frames, out flags, out p1, out p2));
                    int bytes = (int)frames * blockAlign;
                    bool silent = (flags & 2) != 0;
                    if (!silent) {
                        if (raw.Length < bytes) raw = new byte[bytes];
                        Marshal.Copy(data, raw, 0, bytes);
                    }
                    for (int f = 0; f < frames; f++) {
                        float s = 0;
                        if (!silent) {
                            for (int c = 0; c < channels; c++) {
                                s += Sample(raw, f * blockAlign + c * bytesPerSample, bytesPerSample, isFloat);
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
                if (clock.ElapsedMilliseconds - lastFft >= 15) {
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

    /// Una muestra en [-1, 1] desde float32 o PCM entero de 16, 24 o 32 bits (little endian).
    static float Sample(byte[] b, int i, int size, bool isFloat) {
        if (isFloat) return BitConverter.ToSingle(b, i);
        switch (size) {
            case 2: return BitConverter.ToInt16(b, i) / 32768f;
            case 3: return ((b[i] << 8) | (b[i + 1] << 16) | (b[i + 2] << 24)) / 2147483648f;
            default: return BitConverter.ToInt32(b, i) / 2147483648f;
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
        var line = new System.Text.StringBuilder("{\"t\":\"s\",\"v\":[");
        lock (gate) {
            for (int b = 0; b < count; b++) {
                // Subida inmediata y bajada rápida: entre golpe y golpe las barras tienen tiempo de caer.
                bands[b] = Math.Max(next[b], bands[b] * 0.72f);
                if (b > 0) line.Append(',');
                line.Append((int)Math.Round(Math.Min(1f, bands[b]) * 100));
            }
        }
        line.Append("]}");
        string text = line.ToString();
        if (EmitEnabled && text != lastLine) {
            lastLine = text;
            Console.Out.WriteLine(text);
            Console.Out.Flush();
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
"@
        [AuraSpectrum]::Start($Bands)
    } catch {
        $spectrumOk = $false
        Emit @{ t = 'error'; where = 'spectrum'; msg = $_.Exception.Message }
    }
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

# --- Respaldo: barras aproximadas con el volumen ----------------------------------
# Si el espectro no se puede capturar, las barras se mueven con el nivel de audio
# (graves más altos que agudos y un poco de variación) para que el visualizador no quede plano.
$rand = New-Object System.Random
$fallbackBands = New-Object double[] $Bands
function Get-FallbackBands([double]$peak) {
    $out = New-Object int[] $Bands
    for ($i = 0; $i -lt $Bands; $i++) {
        $shape = 1.0 - 0.65 * ($i / [Math]::Max(1, $Bands - 1))
        $target = [Math]::Min(1.0, $peak * 1.6 * $shape * (0.55 + 0.45 * $rand.NextDouble()))
        $fallbackBands[$i] = [Math]::Max($target, $fallbackBands[$i] * 0.8)
        $out[$i] = [int][Math]::Round($fallbackBands[$i] * 100)
    }
    return $out
}

# --- Bucle principal -----------------------------------------------------------
$sw = [Diagnostics.Stopwatch]::StartNew()
$lastLevel = -1.0
$peak = 0.0
$lastMedia = -100000
$lastMeterReset = 0
$lastKey = $null
$lastTrackKey = $null
$lastPos = ''
$lastSpectrum = ''
$lastSpectrumError = ''
$reportedFormat = ''
$lastDevice = $null
$silentSince = -1
$silenceReported = $false
$artPending = 0
$epoch = [DateTimeOffset]::new(1970, 1, 1, 0, 0, 0, [TimeSpan]::Zero)

while ($true) {
    $now = $sw.ElapsedMilliseconds

    # Órdenes de la extensión (botones del reproductor).
    if ($inputOk) {
        while ($null -ne ($cmd = [AuraInput]::Next())) {
            try { Invoke-Command-Line $cmd; $lastMedia = -100000 } catch { Emit @{ t = 'error'; where = 'cmd'; msg = $_.Exception.Message } }
        }
    }

    if ($meterOk) {
        # Re-adquiere el medidor cada 5 s para seguir cambios de salida (audífonos, bocinas...).
        if ($now - $lastMeterReset -gt 5000) { [AuraMeter]::Reset(); $lastMeterReset = $now }
        try {
            $peak = [Math]::Round([double][AuraMeter]::Peak(), 3)
            if ([Math]::Abs($peak - $lastLevel) -ge 0.01 -or ($peak -eq 0 -and $lastLevel -ne 0)) {
                [Console]::Out.WriteLine('{"t":"l","v":' + $peak.ToString('0.000', $inv) + '}')
                $lastLevel = $peak
            }
        } catch {
            [AuraMeter]::Reset()
        }
    }

    # El espectro escucha el dispositivo por el que de verdad está sonando la música.
    if ($meterOk -and $spectrumOk) {
        $active = [string][AuraMeter]::ActiveId
        if ($active -ne $lastDevice) {
            $lastDevice = $active
            [AuraSpectrum]::TargetId = $active
            Emit @{ t = 'info'; where = 'spectrum'; msg = "escuchando el dispositivo $active" }
        }
    }

    # Normalmente el hilo de captura envía las barras él mismo; este bucle solo envía las de respaldo
    # (cuando la captura falla o da silencio mientras hay sonido).
    $values = $null
    $fallback = $null
    $spectrumError = if ($spectrumOk) { [string][AuraSpectrum]::LastError } else { 'no disponible' }
    if ($spectrumOk -and $spectrumError -eq '') {
        $values = [AuraSpectrum]::Bands()
        # Si la captura da silencio pero el medidor oye sonido, se usa el volumen como respaldo.
        $loudest = 0
        foreach ($v in $values) { if ($v -gt $loudest) { $loudest = $v } }
        if ($loudest -le 3 -and $peak -gt 0.05) {
            if ($silentSince -lt 0) { $silentSince = $now }
            if ($now - $silentSince -gt 1500) {
                $fallback = Get-FallbackBands $peak
                if (-not $silenceReported) {
                    $silenceReported = $true
                    Emit @{ t = 'info'; where = 'spectrum'; msg = "la captura da silencio pero hay sonido (nivel $peak): las barras usan el volumen" }
                }
            }
        } else {
            $silentSince = -1
            $silenceReported = $false
        }
        $format = [string][AuraSpectrum]::Format
        if ($format -ne '' -and $format -ne $reportedFormat) {
            $reportedFormat = $format
            Emit @{ t = 'info'; where = 'spectrum'; msg = "capturando audio ($format)" }
        }
    } elseif ($meterOk) {
        $fallback = Get-FallbackBands $peak
    }
    if ($spectrumOk) { [AuraSpectrum]::EmitEnabled = ($null -eq $fallback) }
    # Cada error de captura distinto se informa una vez (aparece en Output → Aura Code).
    if ($spectrumOk -and $spectrumError -ne $lastSpectrumError) {
        $lastSpectrumError = $spectrumError
        if ($spectrumError -ne '') {
            Emit @{ t = 'error'; where = 'spectrum'; msg = "$spectrumError (se usa el volumen como respaldo)" }
        }
    }
    if ($null -ne $fallback) {
        $spectrum = [string]::Join(',', $fallback)
        if ($spectrum -ne $lastSpectrum) {
            [Console]::Out.WriteLine('{"t":"s","v":[' + $spectrum + ']}')
            $lastSpectrum = $spectrum
        }
    }
    [Console]::Out.Flush()

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
