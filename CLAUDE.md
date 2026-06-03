# CLAUDE.md

## Quick Commands

```bash
npm run build            # Compile to dist/esm + dist/cjs (two tsc passes)
npm test                 # Run Jest tests (ts-jest preset)
npm test -- --no-coverage  # Tests without coverage
npm test -- tests/File.test.ts  # Single test file
```

**TypeScript check only:** `npx tsc -p tsconfig.json --noEmit`

## Architecture

Zero-dependency MIDI file read/write library (`midi-rw`). Pure TypeScript, no runtime deps.

```
src/
├── index.ts          — Barrel exports (public API)
├── File.ts           — MIDI file container (MThd header, tracks, serialize)
├── Track.ts          — Track with note/chord/meta event builders
├── MidiEvent.ts      — Immutable MIDI channel event (note on/off, program change, etc.)
├── MetaEvent.ts      — Immutable MIDI meta event (tempo, time sig, key sig)
├── constants.ts      — DEFAULT_VOLUME (90), DEFAULT_DURATION (128), DEFAULT_CHANNEL (0)
├── Util.ts           — Pitch conversion, BPM/MPQN, byte encoding, variable-length quantity
├── MidiData.ts       — Types for parsed MIDI data (MidiData, MidiHeader, MidiTrack, events)
├── Parser.ts         — parseMidi(Uint8Array): MidiData
└── Writer.ts         — writeMidi(MidiData): Uint8Array
```

## Build Output

Dual-format package (ESM + CJS):
- `dist/esm/` — ES modules (`tsconfig.json`: module ESNext, moduleResolution bundler)
- `dist/cjs/` — CommonJS (`tsconfig.cjs.json`: module CommonJS, moduleResolution node)

Both include `.d.ts` declarations and source maps.

## Key Patterns

- **Immutable events:** `MidiEvent` and `MetaEvent` have all `readonly` fields. Construct once, never mutate.
- **Fluent Track API:** All `Track` methods return `this` for chaining.
- **Pitch flexibility:** Methods accepting pitch take `string | number` — note names (`'c#4'`, `'bb3'`) or MIDI numbers (0-127).
- **Delta time:** All `time` parameters are delta ticks from the previous event (MIDI spec standard).
- **End of Track:** `Track.toBytes()` always appends `[0x00, 0xFF, 0x2F, 0x00]` — no need to manually add it.
- **velocity=0 noteOn:** `parseMidi` normalizes these to `noteOff` per MIDI spec.

## Testing

8 test files, ~410 tests covering:
- `File.test.ts` / `Track.test.ts` / `Util.test.ts` — Unit tests
- `VariableLengthQuantity.spec.ts` — All 12 spec examples for VLQ encoding
- `MidiFileFormat.spec.ts` — Byte-level validation against MIDI 1.0 spec
- `ConversionRoundTrips.spec.ts` — BPM/MPQN and pitch round-trip correctness
- `Parser.test.ts` — parseMidi header, meta, channel, and round-trip tests
- `Writer.test.ts` — writeMidi round-trips and semantic alias tests

## Gotchas

- `File.toBlob()` uses the `Blob` API — works in browsers and Node >= 18.
- `mpqnFromBpm` always returns exactly 3 bytes (24-bit big-endian) by zero-padding if needed.
- `addNote(channel, pitch, dur=0)` emits only a noteOn with no noteOff — use a nonzero `dur` to emit both.
- `addNoteOn`/`addNoteOff` use `velocity ?? DEFAULT_VOLUME` so velocity=0 is respected (not replaced by 90).
- The CJS build requires `"verbatimModuleSyntax": false` in `tsconfig.cjs.json` because the source uses `export type`.
