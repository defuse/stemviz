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
then write your animation code in the frame-drawing loop.
