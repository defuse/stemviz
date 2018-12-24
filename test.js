const { createCanvas, loadImage } = require('canvas');
const canvas = createCanvas(1920, 1080);
const ctx = canvas.getContext('2d');
const WaveFile = require('wavefile');

// ffmpeg -r 30 -f image2 -s 1920x1080 -i frames/%05d.png -vcodec libx264 -crf 25 -pix_fmt yuv420p circle.mp4

// ffmpeg -r 30 -f image2 -s 1920x1080 -i frames/%05d.png -i test.wav -vcodec libx264 -crf 25 -pix_fmt yuv420p circle.mp4

var leftpad = require('leftpad');
var fs = require('fs');

var FRAME_RATE = 30;

function load_wav(path, fps) {
    console.log("Loading WAV file [" + path + "]...");

    var wav_contents = fs.readFileSync(path);
    var wav = new WaveFile(wav_contents);
    wav.toBitDepth("16");

    if (wav.fmt.numChannels != 2) {
        console.log("ERROR: wavs must be stereo.");
        exit();
    }

    // FIXME: this assumes 16 bit (/2)
    // FIXME: assuming stereo (/2 again)
    var sample_rate = wav.fmt.sampleRate;
    var length_s = wav.data.samples.length / sample_rate / 2 / 2;
    var total_frames = Math.ceil(length_s * fps);

    console.log(length_s);

    var wav_computed = { fps: fps };
    wav_computed.rms = new Array(total_frames);

    console.log("Preprocessing RMS levels...");

    for (var frame = 0; frame < total_frames; frame++) {
        var time = frame * 1.0 / fps;
        // FIXME: this assumes 16-bit, and compute the actual RMS!

        // Compute RMS.
        var BUFFER_SAMPLES = Math.floor(sample_rate / fps);
        var start_sample = Math.floor(2 * time * sample_rate);
        var mean_squared = 0.0;
        for (var s = 0; s < BUFFER_SAMPLES; s++) {
            try {
                // FIXME: assumes 16-bit
                var sample = wav.getSample(start_sample + s) / 32768;
            } catch (e) {
                wav_computed.rms[frame] = 0.0;
                break;
            }
            mean_squared += sample * sample;
        }
        mean_squared = mean_squared / 4096;

        wav_computed.rms[frame] = Math.sqrt(mean_squared);
    }

    console.log("Finished preprocessing.");

    wav_computed.rms_at = function(time_s) {
        return this.rms[Math.floor(time_s * this.fps)];
    };

    return wav_computed;
}

function stretch(value, start, stop) {

}

function concave(value, parameter) {

}

function convex(value, parameter) {

}

var test_wav = load_wav("./test2.wav", FRAME_RATE);
var time_s = 0.0;

console.log("Drawing video frames...");

for (var frame = 0; frame < 300; frame++) {
    console.log("On frame: " + frame);
    /* Clear everything. */
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* Black background. */
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* Test signal. */
    ctx.fillStyle = "#00aacc";
    ctx.fillRect(0, 0, canvas.width, test_wav.rms_at(time_s) * canvas.height);
    console.log(test_wav.rms_at(time_s));

    fs.writeFileSync('frames/' + leftpad(frame, 5) + '.png', canvas.toBuffer());
    time_s += 1.0/FRAME_RATE;
}

