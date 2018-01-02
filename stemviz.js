const { createCanvas, loadImage } = require('canvas');
const canvas = createCanvas(1920, 1080);
const ctx = canvas.getContext('2d');
const WaveFile = require('wavefile');
var ft = require('fourier-transform');

// TODO: add option to just play the animation in realtime w/ audio

var leftpad = require('leftpad');
var fs = require('fs');

var FRAMES_PER_SECOND = 30;

function load_wav(path, fps) {
    console.log("Loading WAV file [" + path + "]...");

    var wav_computed = { fps: fps };
    wav_computed.data = {};

    /* RMS */
    wav_computed.rms_at = function(time_s) {
        var frame = Math.floor(time_s * this.fps);
        if (frame < this.data.rms.length) {
            return this.data.rms[frame];
        } else {
            return 0.0;
        }
    };

    /* Moving average RMS */
    wav_computed.avg_rms_at = function(time_s) {
        var frame = Math.floor(time_s * this.fps);
        if (frame < this.data.avg_rms.length) {
            return this.data.avg_rms[frame];
        } else {
            return 0.0;
        }
    };

    /* Peak TODO */
    wav_computed.peak_at = function(time_s) {
        var frame = Math.floor(time_s * this.fps);
        if (frame < this.data.peak.length) {
            return this.data.peak[frame];
        } else {
            return 0.0;
        }
    };

    /* Spectra */
    wav_computed.spectra_at = function(time_s) {
        var frame = Math.floor(time_s * this.fps);
        if (frame < this.data.spectra.length) {
            return this.data.spectra[frame];
        } else {
            return new Array(512).fill(0.0);
        }
    };

    var cache_path = path + ".stv";

    if (fs.existsSync(cache_path)) {
        wav_computed.data = JSON.parse(fs.readFileSync(cache_path));
        // TODO can sanity check the loaded data and skip this return if it's
        // bad (store and check the FPS etc)
        return wav_computed;
    }

    var wav_contents = fs.readFileSync(path);
    var wav = new WaveFile(wav_contents);
    wav.toBitDepth("16");

    if (wav.fmt.numChannels != 2) {
        console.log("ERROR: .wav files must be in stereo.");
        exit();
    }

    var sample_rate = wav.fmt.sampleRate;
    // We divide by 2 once because it's 16-bit, and again because it's stereo.
    var length_s = wav.data.samples.length / sample_rate / 2 / 2;
    var total_frames = Math.ceil(length_s * fps);

    console.log("Preprocessing RMS levels...");

    wav_computed.data.rms = new Array(total_frames);

frameloop:
    for (var frame = 0; frame < total_frames; frame++) {
        var time = frame / fps;

        // Compute RMS.
        var BUFFER_SAMPLES = 4096;
        var start_sample = Math.max(0, Math.floor(2 * time * sample_rate - BUFFER_SAMPLES/2.0));
        var mean_squared = 0.0;

        for (var s = 0; s < BUFFER_SAMPLES; s++) {
            try {
                // Compress into [-1, 1] region.
                // 16-bit samples range from -32768 to 32767
                var sample = wav.getSample(start_sample + s) / 32768;
            } catch (e) {
                wav_computed.data.rms[frame] = 0.0;
                break frameloop;
            }
            mean_squared += sample * sample;
        }
        mean_squared = mean_squared / BUFFER_SAMPLES;

        wav_computed.data.rms[frame] = Math.sqrt(mean_squared);
    }

    // Normalize the RMS signal.
    var max_rms = Math.max.apply(null, wav_computed.data.rms);
    for (var frame = 0; frame < total_frames; frame++) {
        // FIXME: this will crash on an all-silence file
        wav_computed.data.rms[frame] /= max_rms;
    }

    console.log("Preprocessing averaged RMS levels...");

    // Compute moving average RMS.
    wav_computed.data.avg_rms = new Array(total_frames);

    var AVG_WINDOW_FRAMES = 6;
    for (var frame = 0; frame < total_frames; frame++) {
        var avg_pos = Math.max(0, frame - AVG_WINDOW_FRAMES + 1);
        var sum = 0.0;
        var n = 0;
        for (; avg_pos <= frame; avg_pos++) {
            sum += wav_computed.data.rms[avg_pos];
            n++;
        }
        wav_computed.data.avg_rms[frame] = sum/n;
    }

    // Normalize the RMS signal.
    var max_avg_rms = Math.max.apply(null, wav_computed.data.avg_rms);
    for (var frame = 0; frame < total_frames; frame++) {
        // FIXME: this will crash on an all-silence file
        wav_computed.data.avg_rms[frame] /= max_avg_rms;
    }

    console.log("Preprocessing spectra...");

    wav_computed.data.spectra = new Array(total_frames);

    var spectra_max = 0.0;
framelooptwo:
    for (var frame = 0; frame < total_frames; frame++) {
        var time = frame / fps;

        // Compute RMS.
        var BUFFER_SAMPLES = 2048;
        var start_sample = Math.max(0, Math.floor(2 * time * sample_rate - BUFFER_SAMPLES/2.0));
        var mean_squared = 0.0;

        var mono_sum = new Array(BUFFER_SAMPLES / 2);

        for (var s = 0; s < BUFFER_SAMPLES / 2; s++) {
            try {
                // FIXME: do this the correct way.
                var s1 = wav.getSample(start_sample + 2 * s) / 32768;
                var s2 = wav.getSample(start_sample + 2 * s + 1) / 32768;
                mono_sum[s] = (s1 + s2) / 2;
            } catch (e) {
                // FIXME: compute the 512 properly
                wav_computed.data.spectra[frame] = new Array(512).fill(0.0);
                break framelooptwo;
            }
        }

        wav_computed.data.spectra[frame] = ft(mono_sum);
        spectra_max = Math.max(spectra_max, Math.max.apply(null, wav_computed.data.spectra[frame]));
    }

    // Globally normalize the spectra.
    // FIXME: is this really what i want to do?
    for (var frame = 0; frame < total_frames; frame++) {
        for (var i = 0; i < wav_computed.data.spectra[frame].length; i++) {
            wav_computed.data.spectra[frame][i] /= spectra_max;
        }
    }

    console.log("Finished preprocessing.");

    console.log("Writing to the cache...");
    fs.writeFileSync(cache_path, JSON.stringify(wav_computed.data));

    return wav_computed;
}

function draw_spectra_bars(canvas, ctx, spectra) {
    // 1080 is divisible by 90
    var truncated = spectra.slice(0, 90);

    var BAR_WIDTH = Math.floor(canvas.width / truncated.length);

    for (var i = 0; i < truncated.length; i++) {
        ctx.fillStyle = "#ffeb3d";
        ctx.fillRect(
            BAR_WIDTH * i,
            0,
            BAR_WIDTH,
            truncated[i] * canvas.height
        );
        ctx.fillRect(
            BAR_WIDTH * i,
            canvas.height - truncated[truncated.length - i - 1] * canvas.height,
            BAR_WIDTH,
            truncated[truncated.length - i - 1] * canvas.height
        );
    }
}

function draw_bg_color(canvas, ctx, color, value) {
    ctx.fillStyle = color;
    ctx.globalAlpha = value;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
}

function draw_outer_circle(canvas, ctx, color, value, angle) {
    var MIN_RADIUS = canvas.width / 6.0;
    var MAX_RADIUS = canvas.height / 2.0;
    var radius = (MAX_RADIUS - MIN_RADIUS) * value + MIN_RADIUS;
    var centerX = canvas.width / 2.0;
    var centerY = canvas.height / 2.0;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    var start_angle = angle - Math.PI/2 - Math.PI/16 - Math.PI/4;
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, start_angle, start_angle + Math.PI/8, false);
    ctx.strokeStyle = '#000000';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI + start_angle, Math.PI + start_angle + Math.PI/8, false);
    ctx.strokeStyle = '#000000';
    ctx.stroke();

    // opposite direction
    start_angle = -Math.PI/16 - angle - Math.PI/4;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, start_angle, start_angle + Math.PI/8, false);
    ctx.strokeStyle = '#000000';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI + start_angle, Math.PI + start_angle + Math.PI/8, false);
    ctx.strokeStyle = '#000000';
    ctx.stroke();
}

function draw_inner_circle(canvas, ctx, color, value) {
    var MIN_RADIUS = 0.0;
    var MAX_RADIUS = canvas.width / 6.0;
    var radius = (MAX_RADIUS - MIN_RADIUS) * value + MIN_RADIUS;
    var centerX = canvas.width / 2.0;
    var centerY = canvas.height / 2.0;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
}

function draw_riser_bars(canvas, ctx, color, value) {
    var BAR_WIDTH = 80;
    var NUM_BARS = Math.ceil(canvas.width / BAR_WIDTH);

    ctx.fillStyle = color;
    for (var i = 0; i < NUM_BARS; i += 2) {
        ctx.fillRect(
            i * BAR_WIDTH,
            canvas.height - value * canvas.height,
            BAR_WIDTH,
            value * canvas.height
        );
    }
}

function draw_faller_bars(canvas, ctx, color, value) {
    var BAR_WIDTH = 80;
    var NUM_BARS = Math.ceil(canvas.width / BAR_WIDTH);

    ctx.fillStyle = color;
    for (var i = 1; i < NUM_BARS; i += 2) {
        ctx.fillRect(
            i * BAR_WIDTH,
            0,
            BAR_WIDTH,
            value * canvas.height
        );
    }
}

var master = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021.wav", FRAMES_PER_SECOND);
var airy_chords = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Airy Chords.wav", FRAMES_PER_SECOND);
var verse_melody = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Verse Melody.wav", FRAMES_PER_SECOND);
var snare_fill = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Snare Fill.wav", FRAMES_PER_SECOND);
var rev_snap = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Rev Snap.wav", FRAMES_PER_SECOND);
var verse_snap = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Verse Snap.wav", FRAMES_PER_SECOND);
var rev_crash = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Rev Crash.wav", FRAMES_PER_SECOND);
var funky_bongo = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Funky Bongo.wav", FRAMES_PER_SECOND);
var fast_bongo = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Fast Bongo.wav", FRAMES_PER_SECOND);
var verse_snare = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Verse Snare.wav", FRAMES_PER_SECOND);
var verse_kick = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Verse Kick.wav", FRAMES_PER_SECOND);
var verse_kick_2 = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Verse Kick 2.wav", FRAMES_PER_SECOND);

var downlifter = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Downlifter.wav", FRAMES_PER_SECOND);
var build_arp = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Build Arp.wav", FRAMES_PER_SECOND);
var build_snare = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Build Snare.wav", FRAMES_PER_SECOND);
var vox_riser = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Vox Riser Low.wav", FRAMES_PER_SECOND);

var drop_kick = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Drop Kick.wav", FRAMES_PER_SECOND);
var drop_snare = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Drop Snare.wav", FRAMES_PER_SECOND);
var hard_ssw = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Hard SSW.wav", FRAMES_PER_SECOND);
var drop_fx = load_wav("./Mix21StemsNormalized/ABCDEF-Mix021 Drop FX.wav", FRAMES_PER_SECOND);

// Start a tiny bit ahead, so the visuals preceede the audio slightly
var time_s = 0.040;

console.log("Drawing video frames...");

var outer_circle_color = "#4d1b7b";
var inner_circle_color = "#ef4f91";
var BPM = 140;

// 226
for (var frame = 0; frame < 226 * FRAMES_PER_SECOND; frame++) {
    console.log("On frame: " + frame);
    /* Clear everything. */
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* Black background. */
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* Background Color */
    draw_bg_color(canvas, ctx, "#363b74", airy_chords.avg_rms_at(time_s));
    draw_bg_color(canvas, ctx, "#ffffff", hard_ssw.rms_at(time_s));

    /* Spectrum */
    //draw_spectra_bars(canvas, ctx, master.spectra_at(time_s));

    /* Riser Bars */
    draw_riser_bars(
        canvas, ctx, "#ef4f91",
        Math.max(
            snare_fill.avg_rms_at(time_s),
            rev_crash.avg_rms_at(time_s),
            drop_fx.avg_rms_at(time_s),
            funky_bongo.avg_rms_at(time_s),
            vox_riser.avg_rms_at(time_s)
        )
    );

    /* Faller Bars */
    draw_faller_bars(
        canvas, ctx, "#673888",
        Math.max(
            snare_fill.avg_rms_at(time_s),
            downlifter.avg_rms_at(time_s),
            fast_bongo.avg_rms_at(time_s),
            rev_crash.avg_rms_at(time_s),
            vox_riser.avg_rms_at(time_s)
        )
    );

    if (drop_kick.rms_at(time_s) > 0) {
        outer_circle_color = "#e80000";
        inner_circle_color = "#000000";
    } else if (verse_kick.rms_at(time_s) > 0 || verse_kick_2.rms_at(time_s) > 0) {
        outer_circle_color = "#4d1b7b";
        inner_circle_color = "#ef4f91";
    }

    /* Outer Circle */
    draw_outer_circle(
        canvas, ctx, outer_circle_color,
        Math.max(
            verse_kick.rms_at(time_s),
            verse_kick_2.rms_at(time_s),
            drop_kick.rms_at(time_s)
        ),
        ((time_s / 60.0 * BPM / 8) % 1) * 2 * Math.PI
    );

    /* Inner Circle */
    draw_inner_circle(
        canvas, ctx, inner_circle_color,
        Math.max(
            0.50 * rev_snap.rms_at(time_s),
            build_snare.rms_at(time_s),
            drop_snare.rms_at(time_s),
            verse_snap.rms_at(time_s),
            verse_snare.rms_at(time_s)
        )
    );

    fs.writeFileSync('frames/' + leftpad(frame, 5) + '.png', canvas.toBuffer());
    time_s += 1.0/FRAMES_PER_SECOND;
}

