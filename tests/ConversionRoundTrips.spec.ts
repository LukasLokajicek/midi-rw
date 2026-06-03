/**
 * ConversionRoundTrips.spec.ts
 *
 * Comprehensive tests for BPM/MPQN conversion, pitch round-trips, and byte
 * encoding utilities in the midi-generator library.
 *
 * MIDI specification context used throughout:
 *   - MIDI pitches range 0–127; middle C = 60 (C4), standard piano A0=21, C8=108
 *   - BPM ↔ MPQN: microseconds_per_quarter_note = 60,000,000 / BPM
 *   - MPQN is encoded as a 3-byte (24-bit) big-endian value in tempo meta events
 */

import {
    midiPitchFromNote, noteFromMidiPitch, ensureMidiPitch,
    mpqnFromBpm, bpmFromMpqn, codes2Str, str2Bytes
} from '../src/Util';


// ---------------------------------------------------------------------------
// 1. BPM → MPQN conversion (mpqnFromBpm)
// ---------------------------------------------------------------------------
describe('mpqnFromBpm', () => {
    describe('standard reference tempos', () => {
        it('converts 120 BPM → [0x07, 0xA1, 0x20] (500,000 μs)', () => {
            // 60,000,000 / 120 = 500,000 = 0x07A120
            expect(mpqnFromBpm(120)).toEqual([0x07, 0xA1, 0x20]);
        });

        it('converts 60 BPM → [0x0F, 0x42, 0x40] (1,000,000 μs)', () => {
            // 60,000,000 / 60 = 1,000,000 = 0x0F4240
            expect(mpqnFromBpm(60)).toEqual([0x0F, 0x42, 0x40]);
        });

        it('converts 240 BPM → [0x03, 0xD0, 0x90] (250,000 μs)', () => {
            // 60,000,000 / 240 = 250,000 = 0x03D090
            expect(mpqnFromBpm(240)).toEqual([0x03, 0xD0, 0x90]);
        });
    });

    describe('100 BPM (600,000 μs = 0x0927C0)', () => {
        it('produces exactly 3 bytes', () => {
            expect(mpqnFromBpm(100)).toHaveLength(3);
        });

        it('encodes the correct byte values [0x09, 0x27, 0xC0]', () => {
            // 60,000,000 / 100 = 600,000 = 0x0927C0
            expect(mpqnFromBpm(100)).toEqual([0x09, 0x27, 0xC0]);
        });

        it('represents 600,000 μs when decoded as a 24-bit big-endian value', () => {
            const [hi, mid, lo] = mpqnFromBpm(100);
            const microseconds = (hi << 16) | (mid << 8) | lo;
            expect(microseconds).toBe(600000);
        });
    });

    describe('output is always 3 bytes regardless of BPM magnitude', () => {
        const tempos = [30, 40, 60, 72, 80, 90, 100, 108, 120, 132, 140, 160, 180, 200, 240, 300, 4000, 10000];

        it.each(tempos)('mpqnFromBpm(%i) returns exactly 3 bytes', (bpm) => {
            expect(mpqnFromBpm(bpm)).toHaveLength(3);
        });
    });

    describe('high BPM values (>3750) encode correct leading-zero-padded bytes', () => {
        it('mpqnFromBpm(4000) → [0x00, 0x3A, 0x98] (15,000 μs)', () => {
            // 60,000,000 / 4000 = 15,000 = 0x003A98
            expect(mpqnFromBpm(4000)).toEqual([0x00, 0x3A, 0x98]);
        });

        it('mpqnFromBpm(10000) → [0x00, 0x17, 0x70] (6,000 μs)', () => {
            // 60,000,000 / 10000 = 6,000 = 0x001770
            expect(mpqnFromBpm(10000)).toEqual([0x00, 0x17, 0x70]);
        });

        it('high BPM round-trips correctly through bpmFromMpqn', () => {
            for (const bpm of [4000, 5000, 8000, 10000]) {
                const [hi, mid, lo] = mpqnFromBpm(bpm);
                const microseconds = (hi << 16) | (mid << 8) | lo;
                expect(bpmFromMpqn(microseconds)).toBe(bpm);
            }
        });
    });

    describe('byte values represent correct microsecond values (big-endian decode)', () => {
        const cases: Array<{ bpm: number; expectedMicroseconds: number }> = [
            { bpm: 120, expectedMicroseconds: 500000 },
            { bpm: 60,  expectedMicroseconds: 1000000 },
            { bpm: 240, expectedMicroseconds: 250000 },
            { bpm: 100, expectedMicroseconds: 600000 },
        ];

        it.each(cases)(
            '$bpm BPM encodes $expectedMicroseconds μs as 24-bit big-endian',
            ({ bpm, expectedMicroseconds }) => {
                const [hi, mid, lo] = mpqnFromBpm(bpm);
                const decoded = (hi << 16) | (mid << 8) | lo;
                expect(decoded).toBe(expectedMicroseconds);
            }
        );
    });
});

// ---------------------------------------------------------------------------
// 2. MPQN → BPM conversion (bpmFromMpqn) — numeric form
// ---------------------------------------------------------------------------
describe('bpmFromMpqn (numeric input)', () => {
    it('converts 500,000 μs → 120 BPM', () => {
        expect(bpmFromMpqn(500000)).toBe(120);
    });

    it('converts 1,000,000 μs → 60 BPM', () => {
        expect(bpmFromMpqn(1000000)).toBe(60);
    });

    it('converts 250,000 μs → 240 BPM', () => {
        expect(bpmFromMpqn(250000)).toBe(240);
    });

    it('converts 600,000 μs → 100 BPM', () => {
        expect(bpmFromMpqn(600000)).toBe(100);
    });

    it('uses Math.floor, so fractional BPMs round down', () => {
        // 60,000,000 / 333333 ≈ 180.0005... → floors to 180
        expect(bpmFromMpqn(333333)).toBe(180);
    });
});

// ---------------------------------------------------------------------------
// 3. bpmFromMpqn — array form
// ---------------------------------------------------------------------------
describe('bpmFromMpqn (array input)', () => {
    describe('3-byte big-endian MPQN arrays decode to correct BPM', () => {
        it('[0x07, 0xA1, 0x20] → 120 BPM (500,000 μs)', () => {
            // Correct big-endian: (0x07<<16)|(0xA1<<8)|0x20 = 500000 → 120 BPM
            expect(bpmFromMpqn([0x07, 0xA1, 0x20])).toBe(120);
        });

        it('[0x0F, 0x42, 0x40] → 60 BPM (1,000,000 μs)', () => {
            // Correct big-endian: (0x0F<<16)|(0x42<<8)|0x40 = 1000000 → 60 BPM
            expect(bpmFromMpqn([0x0F, 0x42, 0x40])).toBe(60);
        });
    });

    describe('array form does not throw', () => {
        it('does not throw for a standard 3-byte MPQN array', () => {
            expect(() => bpmFromMpqn([0x07, 0xA1, 0x20])).not.toThrow();
        });

        it('single element [500000] returns correct BPM', () => {
            // Single-element: arr[0] << 0 = arr[0] = 500000 → 120 BPM
            expect(bpmFromMpqn([500000])).toBe(120);
        });
    });
});

// ---------------------------------------------------------------------------
// 4. Round-trip: BPM → bytes → numeric form (the working path)
//
// The correct round-trip requires decoding the 3-byte big-endian array back
// to a number first, then passing the number to bpmFromMpqn.  This path works.
// ---------------------------------------------------------------------------
describe('BPM round-trips via correct 24-bit big-endian decode', () => {
    const standardBpms = [40, 60, 72, 80, 90, 100, 108, 120, 132, 140, 160, 180, 200, 240];

    it.each(standardBpms)(
        '%i BPM: bpmFromMpqn(bigEndianDecode(mpqnFromBpm(%i))) === %i',
        (bpm) => {
            const [hi, mid, lo] = mpqnFromBpm(bpm);
            const microseconds = (hi << 16) | (mid << 8) | lo;
            expect(bpmFromMpqn(microseconds)).toBe(bpm);
        }
    );
});

// ---------------------------------------------------------------------------
// 5. Pitch round-trips (midiPitchFromNote ↔ noteFromMidiPitch)
// ---------------------------------------------------------------------------
describe('pitch round-trips', () => {
    describe('noteFromMidiPitch → midiPitchFromNote (natural notes)', () => {
        const naturalPitches = [
            // pitch, expected note name
            { pitch: 60, note: 'c4' },  // middle C
            { pitch: 62, note: 'd4' },
            { pitch: 64, note: 'e4' },
            { pitch: 65, note: 'f4' },
            { pitch: 67, note: 'g4' },
            { pitch: 69, note: 'a4' },
            { pitch: 71, note: 'b4' },
            { pitch: 72, note: 'c5' },
            { pitch: 21, note: 'a0' },  // piano low A (A0)
        ];

        it.each(naturalPitches)(
            'midiPitchFromNote(noteFromMidiPitch($pitch)) === $pitch',
            ({ pitch }) => {
                const noteName = noteFromMidiPitch(pitch);
                expect(midiPitchFromNote(noteName)).toBe(pitch);
            }
        );
    });

    describe('midiPitchFromNote named benchmarks', () => {
        it('midiPitchFromNote("c4") === 60 (middle C)', () => {
            expect(midiPitchFromNote('c4')).toBe(60);
        });

        it('midiPitchFromNote("a4") === 69 (concert A)', () => {
            expect(midiPitchFromNote('a4')).toBe(69);
        });

        it('midiPitchFromNote("c5") === 72', () => {
            expect(midiPitchFromNote('c5')).toBe(72);
        });

        it('midiPitchFromNote("a0") === 21 (lowest piano key)', () => {
            expect(midiPitchFromNote('a0')).toBe(21);
        });

        it('midiPitchFromNote("c4") case-insensitive', () => {
            expect(midiPitchFromNote('C4')).toBe(60);
        });
    });

    describe('noteFromMidiPitch round-trip for sharp notes', () => {
        it('round-trips c#4 (61) via sharp form', () => {
            // noteFromMidiPitch returns sharp by default; midiPitchFromNote parses it back
            const name = noteFromMidiPitch(61);
            expect(name).toBe('c#4');
            expect(midiPitchFromNote(name)).toBe(61);
        });

        it('round-trips f#6 (90)', () => {
            expect(midiPitchFromNote(noteFromMidiPitch(90))).toBe(90);
        });
    });
});

// ---------------------------------------------------------------------------
// 6. ensureMidiPitch — accepts number, numeric string, or note name
// ---------------------------------------------------------------------------
describe('ensureMidiPitch', () => {
    it('passes through a number unchanged: ensureMidiPitch(60) === 60', () => {
        expect(ensureMidiPitch(60)).toBe(60);
    });

    it('accepts a numeric string: ensureMidiPitch("60") === 60', () => {
        expect(ensureMidiPitch('60')).toBe(60);
    });

    it('accepts a note name string: ensureMidiPitch("c4") === 60', () => {
        expect(ensureMidiPitch('c4')).toBe(60);
    });

    it('accepts "a4" → 69', () => {
        expect(ensureMidiPitch('a4')).toBe(69);
    });

    it('passes through pitch 0 (number): ensureMidiPitch(0) === 0', () => {
        expect(ensureMidiPitch(0)).toBe(0);
    });

    it('passes through pitch 127 (number): ensureMidiPitch(127) === 127', () => {
        expect(ensureMidiPitch(127)).toBe(127);
    });
});

// ---------------------------------------------------------------------------
// 7. Byte encoding round-trips (str2Bytes / codes2Str)
// ---------------------------------------------------------------------------
describe('str2Bytes', () => {
    describe('single-byte hex values', () => {
        it('str2Bytes("7f", 1) === [0x7F]', () => {
            expect(str2Bytes('7f', 1)).toEqual([0x7F]);
        });

        it('str2Bytes("80", 1) === [0x80]', () => {
            expect(str2Bytes('80', 1)).toEqual([0x80]);
        });

        it('str2Bytes("ff", 1) === [0xFF]', () => {
            expect(str2Bytes('ff', 1)).toEqual([0xFF]);
        });

        it('str2Bytes("00", 1) === [0x00]', () => {
            expect(str2Bytes('00', 1)).toEqual([0x00]);
        });
    });

    describe('multi-byte with zero-padding (finalBytes parameter)', () => {
        it('str2Bytes("1e0", 2) pads to [0x01, 0xE0]', () => {
            // "1e0" is 3 hex chars; needs 4 for 2 bytes; pads to "01e0"
            expect(str2Bytes('1e0', 2)).toEqual([0x01, 0xE0]);
        });

        it('str2Bytes("a1", 2) pads to [0x00, 0xA1]', () => {
            expect(str2Bytes('a1', 2)).toEqual([0x00, 0xA1]);
        });

        it('str2Bytes("0", 1) pads to [0x00]', () => {
            expect(str2Bytes('0', 1)).toEqual([0x00]);
        });
    });

    describe('without finalBytes, parses exact hex string length', () => {
        it('str2Bytes("c") → [0x0C] (single nibble treated as one hex digit)', () => {
            // "c" is a single hex digit; parses as 0x0C
            expect(str2Bytes('c')).toEqual([0x0C]);
        });

        it('str2Bytes("07a120") → [0x07, 0xA1, 0x20] (120 BPM MPQN bytes)', () => {
            expect(str2Bytes('07a120')).toEqual([0x07, 0xA1, 0x20]);
        });
    });
});

describe('codes2Str', () => {
    it('codes2Str([0xFF]) produces a single character with char code 255', () => {
        const result = codes2Str([0xFF]);
        expect(result).toHaveLength(1);
        expect(result.charCodeAt(0)).toBe(0xFF);
    });

    it('codes2Str([0x7F]) produces a single character with char code 127', () => {
        const result = codes2Str([0x7F]);
        expect(result.charCodeAt(0)).toBe(0x7F);
    });

    it('codes2Str([0x00]) produces a null character', () => {
        expect(codes2Str([0x00]).charCodeAt(0)).toBe(0);
    });
});

describe('str2Bytes / codes2Str round-trips', () => {
    it('codes2Str(str2Bytes("ff", 1)) produces char with code 0xFF', () => {
        // str2Bytes("ff", 1) = [0xFF]; codes2Str([0xFF]) = '\xff'
        const bytes = str2Bytes('ff', 1);
        const str = codes2Str(bytes);
        expect(str.charCodeAt(0)).toBe(0xFF);
    });

    it('codes2Str(str2Bytes("7f", 1)) produces char with code 0x7F', () => {
        const str = codes2Str(str2Bytes('7f', 1));
        expect(str.charCodeAt(0)).toBe(0x7F);
    });

    it('codes2Str(str2Bytes("80", 1)) produces char with code 0x80', () => {
        const str = codes2Str(str2Bytes('80', 1));
        expect(str.charCodeAt(0)).toBe(0x80);
    });

    it('round-trips all 3 bytes of 120-BPM MPQN through str2Bytes → codes2Str', () => {
        const hex = '07a120'; // 120 BPM MPQN bytes as hex string
        const bytes = str2Bytes(hex);
        const chars = codes2Str(bytes);
        expect(chars.charCodeAt(0)).toBe(0x07);
        expect(chars.charCodeAt(1)).toBe(0xA1);
        expect(chars.charCodeAt(2)).toBe(0x20);
    });
});

// ---------------------------------------------------------------------------
// 8. Edge cases
// ---------------------------------------------------------------------------
describe('edge cases', () => {
    describe('very fast tempo (300 BPM → 200,000 μs = 0x030D40)', () => {
        it('mpqnFromBpm(300) encodes 200,000 μs as [0x03, 0x0D, 0x40]', () => {
            // 60,000,000 / 300 = 200,000 = 0x030D40
            expect(mpqnFromBpm(300)).toEqual([0x03, 0x0D, 0x40]);
        });

        it('mpqnFromBpm(300) 24-bit big-endian decode === 200,000', () => {
            const [hi, mid, lo] = mpqnFromBpm(300);
            expect((hi << 16) | (mid << 8) | lo).toBe(200000);
        });
    });

    describe('very slow tempo (30 BPM → 2,000,000 μs = 0x1E8480)', () => {
        it('mpqnFromBpm(30) encodes 2,000,000 μs as [0x1E, 0x84, 0x80]', () => {
            // 60,000,000 / 30 = 2,000,000 = 0x1E8480
            expect(mpqnFromBpm(30)).toEqual([0x1E, 0x84, 0x80]);
        });

        it('mpqnFromBpm(30) 24-bit big-endian decode === 2,000,000', () => {
            const [hi, mid, lo] = mpqnFromBpm(30);
            expect((hi << 16) | (mid << 8) | lo).toBe(2000000);
        });
    });

    describe('MIDI pitch boundary notes (0 and 127)', () => {
        it('noteFromMidiPitch(0) returns "c-1"', () => {
            expect(noteFromMidiPitch(0)).toBe('c-1');
        });

        it('noteFromMidiPitch(12) returns "c0"', () => {
            expect(noteFromMidiPitch(12)).toBe('c0');
        });

        it('noteFromMidiPitch(23) returns "b0"', () => {
            expect(noteFromMidiPitch(23)).toBe('b0');
        });

        it('noteFromMidiPitch(127) returns "g9"', () => {
            expect(noteFromMidiPitch(127)).toBe('g9');
        });

        it('midiPitchFromNote(noteFromMidiPitch(127)) round-trips to 127', () => {
            const name = noteFromMidiPitch(127);
            expect(midiPitchFromNote(name)).toBe(127);
        });
    });

    describe('full 0–127 round-trip: midiPitchFromNote(noteFromMidiPitch(n)) === n', () => {
        const allPitches = Array.from({ length: 128 }, (_, i) => i);

        it.each(allPitches)(
            'pitch %i round-trips correctly',
            (pitch) => {
                const name = noteFromMidiPitch(pitch);
                expect(midiPitchFromNote(name)).toBe(pitch);
            }
        );
    });

    describe('midiPitchFromNote throws on invalid input', () => {
        it('throws when input has no octave number', () => {
            expect(() => midiPitchFromNote('c')).toThrow();
        });

        it('throws when input is entirely non-note text', () => {
            expect(() => midiPitchFromNote('xyz')).toThrow();
        });
    });

    describe('bpmFromMpqn numeric form handles large MPQN (slow tempos)', () => {
        it('bpmFromMpqn(2000000) === 30 BPM', () => {
            expect(bpmFromMpqn(2000000)).toBe(30);
        });

        it('bpmFromMpqn(200000) === 300 BPM', () => {
            expect(bpmFromMpqn(200000)).toBe(300);
        });
    });
});
