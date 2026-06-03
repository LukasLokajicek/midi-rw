# midi-rw

Lightweight, zero-dependency MIDI file read/write library for browser and Node.js. Produces and parses valid Standard MIDI File (SMF) format 0 and format 1 binary data.

## Installation

```bash
npm install midi-rw
```

## Quick Start

### Writing a MIDI file

```typescript
import { File, Track } from 'midi-rw';

const file = new File({ ticks: 480 });
const track = file.addTrack();

track
  .setTempo(120)
  .setTimeSignature(4, 4)
  .addNote(0, 'c4', 480)
  .addNote(0, 'e4', 480)
  .addNote(0, 'g4', 480);

// Uint8Array — works in Node.js and browsers
const binary = file.toUint8Array();

// Blob — browser only
const blob = file.toBlob();
```

### Reading a MIDI file

```typescript
import { parseMidi } from 'midi-rw';
import { readFileSync } from 'fs';

const bytes = new Uint8Array(readFileSync('song.mid'));
const midi = parseMidi(bytes);

console.log(midi.header.ticksPerBeat); // e.g. 480
for (const track of midi.tracks) {
  for (const event of track.events) {
    if (event.type === 'channel' && event.subtype === 'noteOn') {
      console.log(event.noteNumber, event.velocity);
    }
  }
}
```

### Round-tripping (parse → modify → write)

```typescript
import { parseMidi, writeMidi } from 'midi-rw';

const midi = parseMidi(bytes);
// inspect or modify midi.tracks[n].events …
const output = writeMidi(midi);
```

## API

### `File`

MIDI file container.

```typescript
new File({ ticks: number }) // ticks per quarter note, default 128
```

| Method | Description |
|--------|-------------|
| `addTrack(): Track` | Creates, adds, and returns a new track |
| `addTrack(track: Track): Track` | Adds an existing track and returns it |
| `toUint8Array(): Uint8Array` | Serializes to a byte array |
| `toBlob(genericType?: boolean): Blob` | Creates a Blob (`audio/x-midi` by default) |

| Property | Description |
|----------|-------------|
| `ticks: number` | Ticks per quarter note (1–32767) |
| `tracks: readonly Track[]` | All tracks in the file |

### `Track`

A single MIDI track. All mutating methods return `this` for chaining.

```typescript
track
  .setTempo(140)
  .setTimeSignature(3, 4)
  .setKeySignature(-2)           // Bb major (2 flats)
  .setInstrument(0, 0x00)        // Piano on channel 0
  .addNote(0, 'c4', 480)         // channel, pitch, duration in ticks
  .addChord(0, ['c4', 'e4', 'g4'], 480);
```

| Method | Parameters | Description |
|--------|-----------|-------------|
| `addNote` | `(channel, pitch, duration?, time?, velocity?)` | Emits note-on + note-off pair |
| `addNoteOn` | `(channel, pitch, time?, velocity?)` | Note-on event |
| `addNoteOff` | `(channel, pitch, time?, velocity?)` | Note-off event |
| `addChord` | `(channel, pitches[], duration, velocity?)` | Multiple simultaneous notes |
| `setTempo` | `(bpm, time?)` | Tempo meta event |
| `setTimeSignature` | `(numerator, denominator, time?)` | Denominator must be a power of 2 |
| `setKeySignature` | `(accidentals, minor?, time?)` | Accidentals: −7 (flats) to +7 (sharps) |
| `setInstrument` | `(channel, instrument, time?)` | Program change |
| `addEvent` | `(event: MidiEvent \| MetaEvent)` | Add a raw event object |

**Pitch** accepts a MIDI number (0–127) or a note name string (`'c4'`, `'f#5'`, `'bb3'`).  
**Time** values are delta ticks from the previous event.

### `parseMidi(bytes: Uint8Array): MidiData`

Parses a MIDI file into a plain data object.

```typescript
interface MidiData {
  header: {
    format: number;         // 0 or 1
    numTracks: number;
    ticksPerBeat: number;
  };
  tracks: Array<{
    events: MidiEvent[];    // MidiChannelEvent | MidiMetaEvent
  }>;
  errors: ParseError[];     // non-fatal parse errors
}
```

**Channel event fields:**

```typescript
interface MidiChannelEvent {
  type: 'channel';
  subtype: 'noteOn' | 'noteOff' | 'noteAftertouch' | 'controller'
         | 'programChange' | 'channelAftertouch' | 'pitchBend';
  deltaTime: number;
  channel: number;
  param1: number;
  param2?: number;
  // Semantic aliases:
  noteNumber?: number;  // noteOn, noteOff, noteAftertouch
  velocity?: number;    // noteOn, noteOff
  controller?: number;  // controller
  value?: number;       // controller, pitchBend, aftertouch
  program?: number;     // programChange
  pressure?: number;    // channelAftertouch
}
```

> `velocity=0` note-on events are automatically normalized to `noteOff` per the MIDI spec.

**Meta event fields:**

```typescript
interface MidiMetaEvent {
  type: 'meta';
  subtype: 'tempo' | 'timeSignature' | 'keySignature' | 'trackName'
         | 'instrumentName' | 'lyrics' | 'marker' | 'cuePoint'
         | 'endOfTrack' | 'unknown';
  deltaTime: number;
  // Subtype-specific:
  bpm?: number;           // tempo
  numerator?: number;     // timeSignature
  denominator?: number;   // timeSignature
  accidentals?: number;   // keySignature (−7 to +7)
  minor?: boolean;        // keySignature
  text?: string;          // text subtypes
  data?: number[];        // unknown subtypes
}
```

### `writeMidi(data: MidiData): Uint8Array`

Serializes a `MidiData` object (as returned by `parseMidi`) back to a MIDI byte array.

### `MidiEvent` / `MetaEvent`

Low-level immutable event classes for constructing events directly.

```typescript
import { MidiEvent, MetaEvent } from 'midi-rw';

new MidiEvent({ type: MidiEvent.NOTE_ON, channel: 0, param1: 60, param2: 100 });
new MetaEvent({ type: MetaEvent.TEMPO, data: [0x07, 0xA1, 0x20], time: 0 });
```

### Utility functions

```typescript
import { midiPitchFromNote, noteFromMidiPitch, mpqnFromBpm, bpmFromMpqn } from 'midi-rw';

midiPitchFromNote('c4')         // → 60
noteFromMidiPitch(60)           // → 'c4'
noteFromMidiPitch(61, true)     // → 'db4'  (flattened form)
mpqnFromBpm(120)                // → [0x07, 0xA1, 0x20]
bpmFromMpqn(500000)             // → 120
```

## Features

- Zero dependencies
- Full TypeScript support with strict types and declaration files
- Dual ESM + CommonJS build — works with `import` and `require`
- Works in browsers and Node.js ≥ 18
- Reads and writes MIDI format 0 (single track) and format 1 (multi-track)
- Running status decoding per MIDI 1.0 spec
- Immutable event objects, fluent track builder API
- Note names with sharps and flats (`'c#4'`, `'bb3'`)

## License

MIT
