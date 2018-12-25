const { createCanvas, loadImage } = require('canvas');
const canvas = createCanvas(1920, 1080);
const ctx = canvas.getContext('2d');
const WaveFile = require('wavefile');

// ffmpeg -r 30 -f image2 -s 1920x1080 -i frames/%05d.png -i test.wav -vcodec libx264 -crf 25 -pix_fmt yuv420p circle.mp4

var leftpad = require('leftpad');
var fs = require('fs');

var FRAMES_PER_SECOND = 30;

function load_wav(path, fps) {
    console.log("Loading WAV file [" + path + "]...");

    var wav_computed = { fps: fps };
    wav_computed.data = {};

    // FIXME: return 0 on oob time

    /* RMS */
    wav_computed.rms_at = function(time_s) {
        return this.data.rms[Math.floor(time_s * this.fps)];
    };

    /* Peak TODO */
    wav_computed.peak_at = function(time_s) {
        return this.data.peak[Math.floor(time_s * this.fps)];
    };

    /* Moving average RMS TODO */
    wav_computed.avg_rms_at = function(time_s) {
        return this.data.avg_rms[Math.floor(time_s * this.fps)];
    };

    /* Pitch tracker TODO*/
    wav_computed.pitch_at = function(time_s) {
        return this.data.pitch[Math.floor(time_s * this.fps)];
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

    wav_computed.data.rms = new Array(total_frames);

    console.log("Preprocessing RMS levels...");

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
                break;
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

    console.log("Finished preprocessing.");

    console.log("Writing to the cache...");
    fs.writeFileSync(cache_path, JSON.stringify(wav_computed.data));

    return wav_computed;
}

function range(value, start, stop) {
    if (value < start) {
        return start;
    } else if (value > stop) {
        return stop;
    } else {
        return value;
    }
}

function concave(value, parameter) {

}

function convex(value, parameter) {

}

function draw_bar_chart(canvas, ctx, elements) {
    var BAR_WIDTH = Math.floor(canvas.width / elements.length);

    for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        ctx.fillStyle = "#00aacc";
        ctx.fillRect(
            BAR_WIDTH * i,
            canvas.height - element.rms_at(time_s) * canvas.height,
            BAR_WIDTH,
            element.rms_at(time_s) * canvas.height
        );
    }
}

function draw_bg_color(canvas, ctx, color, value) {
    ctx.fillStyle = color;
    ctx.globalAlpha = value;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
}

function draw_outer_circle(canvas, ctx, color, value) {
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
    ctx.lineWidth = 10;
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

var time_s = 0.0;

console.log("Drawing video frames...");

// 226
for (var frame = 0; frame < 120 * FRAMES_PER_SECOND; frame++) {
    console.log("On frame: " + frame);
    /* Clear everything. */
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* Black background. */
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var elements = [
        airy_chords, verse_melody, snare_fill, rev_snap, verse_snap, rev_crash,
        funky_bongo, fast_bongo, verse_snare, downlifter, build_arp, build_snare,
        vox_riser, drop_kick, drop_snare, hard_ssw, drop_fx
    ];

    //draw_bar_chart(canvas, ctx, elements);

    /* Background Color */
    draw_bg_color(canvas, ctx, "#363b74", airy_chords.rms_at(time_s));
    draw_bg_color(canvas, ctx, "#ffffff", hard_ssw.rms_at(time_s));

    /* Riser Bars */
    draw_riser_bars(canvas, ctx, "#ef4f91", rev_crash.rms_at(time_s));
    draw_riser_bars(canvas, ctx, "#ef4f91", drop_fx.rms_at(time_s));
    draw_riser_bars(canvas, ctx, "#ef4f91", funky_bongo.rms_at(time_s));


    /* Faller Bars */
    draw_faller_bars(canvas, ctx, "#673888", snare_fill.rms_at(time_s));
    draw_faller_bars(canvas, ctx, "#673888", downlifter.rms_at(time_s));
    draw_faller_bars(canvas, ctx, "#673888", fast_bongo.rms_at(time_s));

    /* Outer Circle */
    draw_outer_circle(canvas, ctx, "#4d1b7b", verse_kick.rms_at(time_s));
    draw_outer_circle(canvas, ctx, "#4d1b7b", verse_kick_2.rms_at(time_s));
    draw_outer_circle(canvas, ctx, "#4d1b7b", drop_kick.rms_at(time_s));

    /* Inner Circle */
    draw_inner_circle(canvas, ctx, "#c79dd7", build_snare.rms_at(time_s));
    draw_inner_circle(canvas, ctx, "#c79dd7", drop_snare.rms_at(time_s));
    draw_inner_circle(canvas, ctx, "#c79dd7", verse_snap.rms_at(time_s));
    draw_inner_circle(canvas, ctx, "#c79dd7", verse_snare.rms_at(time_s));

    fs.writeFileSync('frames/' + leftpad(frame, 5) + '.png', canvas.toBuffer());
    time_s += 1.0/FRAMES_PER_SECOND;
}

