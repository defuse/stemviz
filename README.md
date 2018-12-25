# StemViz

SteamViz is **experimental** Node JS code for producing music visualizations
from stems. Instead of trying to extract visualizaiton-relevant information from
the end-product music file, StemViz extracts signals from separate audio files
for each instrument. This means you must have access to the stems for the music
you want to visualize.

## Dependencies

- The `ffmpeg` utility.
- `npm install canvas wavefile leftpad`

## Usage

Visualizations are written in JavaScript. All of the code currently lives in
`stemviz.js`. You will have to modify the code to load your `.wav` stems and
then write your animation code in the frame-drawing loop. The code will write
each frame to a `.png` file in the `./frames` directory. You can then convert
the `.png` files into a video file with `ffmpg` with a command like...

```
ffmpeg -r 30 -f image2 -s 1920x1080 -i frames/%05d.png -i Mix21StemsNormalized/ABCDEF-Mix021.wav -vcodec libx264 -crf 25 -pix_fmt yuv420p output.mp4
```
