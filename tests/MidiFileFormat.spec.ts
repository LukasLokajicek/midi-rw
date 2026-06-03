/**
 * MIDI File Format Specification Tests
 *
 * Verifies that File and Track produce byte sequences that conform to the
 * Standard MIDI File (SMF) 1.0 specification.  Every assertion in this file
 * is tied to a concrete byte offset or byte pattern defined in the spec.
 *
 * Reference: Standard MIDI-File Format Spec 1.1 (updated)
 *   https://www.midi.org/specifications/file-format-specifications/standard-midi-files
 *
 * Layout reminder
 * ───────────────
 * MThd chunk (14 bytes):
 *   [0-3]   "MThd"  (0x4D 0x54 0x68 0x64)
 *   [4-7]   chunk length = 6  (0x00 0x00 0x00 0x06)
 *   [8-9]   format type  (0x00 0x00 = type 0, 0x00 0x01 = type 1)
 *   [10-11] number of tracks (big-endian uint16)
 *   [12-13] ticks per quarter note (big-endian uint16, bit 15 = 0 for metrical)
 *
 * MTrk chunk:
 *   [0-3]   "MTrk"  (0x4D 0x54 0x72 0x6B)
 *   [4-7]   data length (big-endian uint32)
 *   [8..]   delta-time / event pairs
 *   last 4  End of Track:  0x00 0xFF 0x2F 0x00
 */

import {File, Track} from '../src';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


/** Read a big-endian uint32 from four consecutive bytes. */
function readUint32BE(bytes: Uint8Array, offset: number): number {
    return (
        (bytes[offset]     << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8)  |
         bytes[offset + 3]
    ) >>> 0;  // >>> 0 keeps it unsigned
}

/** Build a minimal single-track file containing only the supplied events. */
function singleTrackFile(
    configure: (track: Track) => void,
    ticks = 128,
): Uint8Array {
    const file = new File({ticks});
    const track = file.addTrack();
    configure(track);
    return file.toUint8Array();
}

// ---------------------------------------------------------------------------
// 1. MThd Header Format
// ---------------------------------------------------------------------------

describe('MThd header format', () => {
    describe('chunk identifier', () => {
        it('bytes 0-3 spell "MThd" (0x4D 0x54 0x68 0x64)', () => {
            const bytes = singleTrackFile(() => {});

            expect(bytes[0]).toBe(0x4D); // 'M'
            expect(bytes[1]).toBe(0x54); // 'T'
            expect(bytes[2]).toBe(0x68); // 'h'
            expect(bytes[3]).toBe(0x64); // 'd'
        });
    });

    describe('chunk length field', () => {
        it('bytes 4-7 are 0x00 0x00 0x00 0x06 (header data is always 6 bytes)', () => {
            const bytes = singleTrackFile(() => {});

            expect(bytes[4]).toBe(0x00);
            expect(bytes[5]).toBe(0x00);
            expect(bytes[6]).toBe(0x00);
            expect(bytes[7]).toBe(0x06);
        });
    });

    describe('format type — format 0 (single track)', () => {
        it('bytes 8-9 are 0x00 0x00 when there is exactly 1 track', () => {
            const bytes = singleTrackFile(() => {});

            expect(bytes[8]).toBe(0x00);
            expect(bytes[9]).toBe(0x00);
        });
    });

    describe('format type — format 1 (multi-track)', () => {
        it('bytes 8-9 are 0x00 0x01 when there are 2 tracks', () => {
            const file = new File();
            file.addTrack(new Track());
            file.addTrack(new Track());
            const bytes = file.toUint8Array();

            expect(bytes[8]).toBe(0x00);
            expect(bytes[9]).toBe(0x01);
        });

        it('bytes 8-9 are 0x00 0x01 when there are 3 tracks', () => {
            const file = new File();
            file.addTrack(new Track());
            file.addTrack(new Track());
            file.addTrack(new Track());
            const bytes = file.toUint8Array();

            expect(bytes[8]).toBe(0x00);
            expect(bytes[9]).toBe(0x01);
        });
    });

    describe('track count', () => {
        it('bytes 10-11 encode 1 (0x00 0x01) for a single-track file', () => {
            const bytes = singleTrackFile(() => {});

            expect(bytes[10]).toBe(0x00);
            expect(bytes[11]).toBe(0x01);
        });

        it('bytes 10-11 encode 2 (0x00 0x02) for a two-track file', () => {
            const file = new File();
            file.addTrack(new Track());
            file.addTrack(new Track());
            const bytes = file.toUint8Array();

            expect(bytes[10]).toBe(0x00);
            expect(bytes[11]).toBe(0x02);
        });

        it('bytes 10-11 encode 3 (0x00 0x03) for a three-track file', () => {
            const file = new File();
            file.addTrack(new Track());
            file.addTrack(new Track());
            file.addTrack(new Track());
            const bytes = file.toUint8Array();

            expect(bytes[10]).toBe(0x00);
            expect(bytes[11]).toBe(0x03);
        });
    });
});

// ---------------------------------------------------------------------------
// 2. Ticks per Quarter Note Encoding (bytes 12-13)
// ---------------------------------------------------------------------------

describe('MThd ticks-per-quarter-note encoding (bytes 12-13)', () => {
    // The spec: bit 15 = 0 means "metrical time"; the remaining 15 bits hold
    // the number of ticks per quarter note, stored big-endian.

    it('encodes 96 ticks correctly: 0x00 0x60', () => {
        const bytes = singleTrackFile(() => {}, 96);

        expect(bytes[12]).toBe(0x00);
        expect(bytes[13]).toBe(0x60); // 96 = 0x60
    });

    it('encodes 120 ticks correctly: 0x00 0x78', () => {
        const bytes = singleTrackFile(() => {}, 120);

        expect(bytes[12]).toBe(0x00);
        expect(bytes[13]).toBe(0x78); // 120 = 0x78
    });

    it('encodes 480 ticks correctly: 0x01 0xE0', () => {
        const bytes = singleTrackFile(() => {}, 480);

        // 480 = 0x01E0; high byte = 0x01, low byte = 0xE0
        expect(bytes[12]).toBe(0x01);
        expect(bytes[13]).toBe(0xE0);
    });

    it('encodes 128 ticks (default) correctly: 0x00 0x80', () => {
        const file = new File(); // default ticks = 128
        file.addTrack(new Track());
        const bytes = file.toUint8Array();

        expect(bytes[12]).toBe(0x00);
        expect(bytes[13]).toBe(0x80); // 128 = 0x80
    });

    it('bit 15 of ticks field is 0 for all metrical-time tick values (no SMPTE)', () => {
        for (const ticks of [96, 120, 128, 240, 480, 960]) {
            const bytes = singleTrackFile(() => {}, ticks);
            // The high byte of a 16-bit value lives in bytes[12].
            // Bit 15 of the 16-bit value = bit 7 of bytes[12].
            expect(bytes[12] & 0x80).toBe(0);
        }
    });
});

// ---------------------------------------------------------------------------
// 3. MTrk Track Chunk Structure
// ---------------------------------------------------------------------------

describe('MTrk track chunk structure', () => {
    describe('chunk identifier', () => {
        it('track chunk starts with "MTrk" (0x4D 0x54 0x72 0x6B) immediately after 14-byte header', () => {
            const bytes = singleTrackFile(() => {});
            const trackStart = 14;

            expect(bytes[trackStart]).toBe(0x4D); // 'M'
            expect(bytes[trackStart + 1]).toBe(0x54); // 'T'
            expect(bytes[trackStart + 2]).toBe(0x72); // 'r'
            expect(bytes[trackStart + 3]).toBe(0x6B); // 'k'
        });

        it('second track chunk also starts with "MTrk" in a two-track file', () => {
            const file = new File();
            // First track with one note so we can compute its size and find the second track.
            const t1 = file.addTrack();
            t1.addNoteOn(0, 60, 0, 90);
            const t2 = file.addTrack();
            t2.addNoteOn(0, 64, 0, 90);

            const bytes = file.toUint8Array();

            // Track 1 data length is stored in bytes 18-21 (offset 14+4).
            const t1DataLen = readUint32BE(bytes, 14 + 4);
            const t2Start = 14 + 8 + t1DataLen; // header(14) + MTrk_id(4) + length(4) + data

            expect(bytes[t2Start]).toBe(0x4D);
            expect(bytes[t2Start + 1]).toBe(0x54);
            expect(bytes[t2Start + 2]).toBe(0x72);
            expect(bytes[t2Start + 3]).toBe(0x6B);
        });
    });

    describe('chunk length accuracy', () => {
        it('the 4 bytes after "MTrk" equal the exact remaining byte count of that track', () => {
            const bytes = singleTrackFile(t => {
                t.addNoteOn(0, 60, 0, 90);
                t.addNoteOff(0, 60, 128, 0);
            });

            const trackStart = 14;
            const storedLength = readUint32BE(bytes, trackStart + 4);

            // The actual payload sits from byte [trackStart + 8] to end of the array.
            const actualPayloadLength = bytes.length - (trackStart + 8);

            expect(storedLength).toBe(actualPayloadLength);
        });

        it('an empty track (no events) has a chunk length of 4 (only End of Track)', () => {
            const bytes = singleTrackFile(() => {}); // no events added

            const storedLength = readUint32BE(bytes, 14 + 4);

            // End of Track = delta(0x00) + 0xFF + 0x2F + 0x00 = 4 bytes
            expect(storedLength).toBe(4);
        });

        it('chunk length grows correctly when events are added', () => {
            // A single Note On event at time 0 contributes exactly 4 bytes:
            //   delta(0x00) + status(0x90) + note(0x3C) + velocity(0x5A) = 4 bytes
            const bytesWithNote = singleTrackFile(t => t.addNoteOn(0, 60, 0, 90));
            const storedLengthWithNote = readUint32BE(bytesWithNote, 14 + 4);

            const bytesEmpty = singleTrackFile(() => {});
            const storedLengthEmpty = readUint32BE(bytesEmpty, 14 + 4);

            // The note event should add 4 bytes to the length (delta + status + note + vel)
            expect(storedLengthWithNote - storedLengthEmpty).toBe(4);
        });
    });
});

// ---------------------------------------------------------------------------
// 4. End of Track Meta Event
// ---------------------------------------------------------------------------

describe('End of Track meta event', () => {
    it('every track ends with delta=0x00 FF 2F 00', () => {
        const bytes = singleTrackFile(t => {
            t.addNoteOn(0, 60, 0, 90);
        });

        // The last 4 bytes of the entire file belong to the only track's End of Track.
        const last4 = bytes.slice(-4);
        expect(last4[0]).toBe(0x00); // delta time = 0
        expect(last4[1]).toBe(0xFF); // meta event marker
        expect(last4[2]).toBe(0x2F); // End of Track type
        expect(last4[3]).toBe(0x00); // length = 0
    });

    it('each track in a multi-track file ends with FF 2F 00', () => {
        const file = new File();
        const t1 = file.addTrack();
        t1.setTempo(120);

        const t2 = file.addTrack();
        t2.addNoteOn(0, 60, 0, 90);

        const bytes = file.toUint8Array();

        // Track 1
        const t1DataLen = readUint32BE(bytes, 14 + 4);
        const t1EndOffset = 14 + 8 + t1DataLen - 4; // last 4 bytes of track 1
        expect(bytes[t1EndOffset]).toBe(0x00);
        expect(bytes[t1EndOffset + 1]).toBe(0xFF);
        expect(bytes[t1EndOffset + 2]).toBe(0x2F);
        expect(bytes[t1EndOffset + 3]).toBe(0x00);

        // Track 2 (last 4 bytes of file)
        const last4 = bytes.slice(-4);
        expect(last4[0]).toBe(0x00);
        expect(last4[1]).toBe(0xFF);
        expect(last4[2]).toBe(0x2F);
        expect(last4[3]).toBe(0x00);
    });
});

// ---------------------------------------------------------------------------
// 5. Set Tempo Meta Event (FF 51 03 tt tt tt)
// ---------------------------------------------------------------------------

describe('Set Tempo meta event', () => {
    // Spec: FF 51 03 tt tt tt
    // 120 BPM → 500 000 μs/qn = 0x07A120 → bytes: 07 A1 20

    it('120 BPM encodes as FF 51 03 07 A1 20', () => {
        const bytes = singleTrackFile(t => t.setTempo(120));

        // The tempo event immediately follows the MThd header and the MTrk header+length.
        // Layout: 14 (MThd) + 4 (MTrk id) + 4 (length) = offset 22 for first event.
        const eventOffset = 22;

        expect(bytes[eventOffset]).toBe(0x00); // delta time
        expect(bytes[eventOffset + 1]).toBe(0xFF); // meta marker
        expect(bytes[eventOffset + 2]).toBe(0x51); // Set Tempo type
        expect(bytes[eventOffset + 3]).toBe(0x03); // data length = 3
        expect(bytes[eventOffset + 4]).toBe(0x07); // 500 000 high byte
        expect(bytes[eventOffset + 5]).toBe(0xA1); // 500 000 mid byte
        expect(bytes[eventOffset + 6]).toBe(0x20); // 500 000 low byte
    });

    it('140 BPM encodes the correct 3-byte microsecond value (428571 = 0x068A1B)', () => {
        const bytes = singleTrackFile(t => t.setTempo(140));
        const eventOffset = 22;

        expect(bytes[eventOffset]).toBe(0x00);
        expect(bytes[eventOffset + 1]).toBe(0xFF);
        expect(bytes[eventOffset + 2]).toBe(0x51);
        expect(bytes[eventOffset + 3]).toBe(0x03);
        // Math.floor(60_000_000 / 140) = 428571 = 0x068A1B
        // (6*65536 + 138*256 + 27 = 428571)
        expect(bytes[eventOffset + 4]).toBe(0x06);
        expect(bytes[eventOffset + 5]).toBe(0x8A);
        expect(bytes[eventOffset + 6]).toBe(0x1B);
    });

    it('the tempo data length byte is always 3', () => {
        for (const bpm of [60, 90, 120, 140, 180, 200]) {
            const bytes = singleTrackFile(t => t.setTempo(bpm));
            expect(bytes[22 + 3]).toBe(0x03); // length byte after FF 51
        }
    });
});

// ---------------------------------------------------------------------------
// 6. Time Signature Meta Event (FF 58 04 nn dd cc bb)
// ---------------------------------------------------------------------------

describe('Time Signature meta event', () => {
    // Spec: FF 58 04 nn dd cc bb
    //   nn = numerator, dd = log2(denominator), cc = MIDI clocks per click, bb = 32nd notes per MIDI quarter note
    // 4/4: FF 58 04 04 02 18 08  (log2(4)=2, 0x18=24 clocks, 0x08=8 32nd notes)
    // 6/8: FF 58 04 06 03 18 08  (log2(8)=3, 0x18=24 clocks, 0x08=8 32nd notes)

    it('4/4 time signature encodes as FF 58 04 04 02 18 08', () => {
        const bytes = singleTrackFile(t => t.setTimeSignature(4, 4));
        const eventOffset = 22;

        expect(bytes[eventOffset]).toBe(0x00); // delta time
        expect(bytes[eventOffset + 1]).toBe(0xFF); // meta marker
        expect(bytes[eventOffset + 2]).toBe(0x58); // Time Signature type
        expect(bytes[eventOffset + 3]).toBe(0x04); // data length = 4
        expect(bytes[eventOffset + 4]).toBe(0x04); // nn = 4
        expect(bytes[eventOffset + 5]).toBe(0x02); // dd = log2(4) = 2
        expect(bytes[eventOffset + 6]).toBe(0x18); // cc = 24 MIDI clocks per click
        expect(bytes[eventOffset + 7]).toBe(0x08); // bb = 8 32nd notes per quarter
    });

    it('6/8 time signature encodes as FF 58 04 06 03 18 08', () => {
        const bytes = singleTrackFile(t => t.setTimeSignature(6, 8));
        const eventOffset = 22;

        expect(bytes[eventOffset]).toBe(0x00);
        expect(bytes[eventOffset + 1]).toBe(0xFF);
        expect(bytes[eventOffset + 2]).toBe(0x58);
        expect(bytes[eventOffset + 3]).toBe(0x04);
        expect(bytes[eventOffset + 4]).toBe(0x06); // nn = 6
        expect(bytes[eventOffset + 5]).toBe(0x03); // dd = log2(8) = 3
        expect(bytes[eventOffset + 6]).toBe(0x18);
        expect(bytes[eventOffset + 7]).toBe(0x08);
    });

    it('3/4 time signature encodes nn=3 dd=2', () => {
        const bytes = singleTrackFile(t => t.setTimeSignature(3, 4));
        const eventOffset = 22;

        expect(bytes[eventOffset + 4]).toBe(0x03); // numerator
        expect(bytes[eventOffset + 5]).toBe(0x02); // log2(4) = 2
    });

    it('2/2 (cut time) time signature encodes nn=2 dd=1', () => {
        const bytes = singleTrackFile(t => t.setTimeSignature(2, 2));
        const eventOffset = 22;

        expect(bytes[eventOffset + 4]).toBe(0x02); // numerator
        expect(bytes[eventOffset + 5]).toBe(0x01); // log2(2) = 1
    });

    it('the time signature data length byte is always 4', () => {
        for (const [num, den] of [[2, 4], [3, 4], [4, 4], [6, 8], [12, 8]] as [number, number][]) {
            const bytes = singleTrackFile(t => t.setTimeSignature(num, den));
            expect(bytes[22 + 3]).toBe(0x04); // length byte after FF 58
        }
    });

    it('throws when denominator is not a power of 2', () => {
        const track = new Track();
        expect(() => track.setTimeSignature(4, 3)).toThrow();
        expect(() => track.setTimeSignature(4, 5)).toThrow();
        expect(() => track.setTimeSignature(4, 6)).toThrow();
    });
});

// ---------------------------------------------------------------------------
// 7. Key Signature Meta Event (FF 59 02 sf mi)
// ---------------------------------------------------------------------------

describe('Key Signature meta event', () => {
    // Spec: FF 59 02 sf mi
    //   sf: negative = flats, positive = sharps (stored as signed byte via & 0xFF)
    //   mi: 0 = major, 1 = minor
    // Examples: C major = 00 00, A minor = 00 01, G major = 01 00, F major = FF 00

    it('C major (0 accidentals, major) encodes as FF 59 02 00 00', () => {
        const bytes = singleTrackFile(t => t.setKeySignature(0, false));
        const eventOffset = 22;

        expect(bytes[eventOffset]).toBe(0x00); // delta time
        expect(bytes[eventOffset + 1]).toBe(0xFF); // meta marker
        expect(bytes[eventOffset + 2]).toBe(0x59); // Key Signature type
        expect(bytes[eventOffset + 3]).toBe(0x02); // data length = 2
        expect(bytes[eventOffset + 4]).toBe(0x00); // sf = 0 sharps/flats
        expect(bytes[eventOffset + 5]).toBe(0x00); // mi = 0 (major)
    });

    it('A minor (0 accidentals, minor) encodes as FF 59 02 00 01', () => {
        const bytes = singleTrackFile(t => t.setKeySignature(0, true));
        const eventOffset = 22;

        expect(bytes[eventOffset + 4]).toBe(0x00); // sf = 0
        expect(bytes[eventOffset + 5]).toBe(0x01); // mi = 1 (minor)
    });

    it('G major (1 sharp) encodes as FF 59 02 01 00', () => {
        const bytes = singleTrackFile(t => t.setKeySignature(1, false));
        const eventOffset = 22;

        expect(bytes[eventOffset + 4]).toBe(0x01); // sf = 1 (one sharp)
        expect(bytes[eventOffset + 5]).toBe(0x00); // mi = 0 (major)
    });

    it('F major (1 flat) encodes sf as 0xFF (twos complement -1)', () => {
        // The spec stores flats as a negative number.  -1 & 0xFF = 0xFF.
        const bytes = singleTrackFile(t => t.setKeySignature(-1, false));
        const eventOffset = 22;

        expect(bytes[eventOffset + 4]).toBe(0xFF); // sf = -1 → 0xFF
        expect(bytes[eventOffset + 5]).toBe(0x00); // mi = 0 (major)
    });

    it('D minor (1 sharp, minor) encodes sf=0x01 mi=0x01', () => {
        const bytes = singleTrackFile(t => t.setKeySignature(1, true));
        const eventOffset = 22;

        expect(bytes[eventOffset + 4]).toBe(0x01);
        expect(bytes[eventOffset + 5]).toBe(0x01);
    });

    it('Bb major (2 flats) encodes sf as 0xFE (-2 & 0xFF)', () => {
        const bytes = singleTrackFile(t => t.setKeySignature(-2, false));
        const eventOffset = 22;

        expect(bytes[eventOffset + 4]).toBe(0xFE); // -2 & 0xFF
        expect(bytes[eventOffset + 5]).toBe(0x00);
    });

    it('the key signature data length byte is always 2', () => {
        for (const [acc, minor] of [[0, false], [1, false], [-1, false], [0, true]] as [number, boolean][]) {
            const bytes = singleTrackFile(t => t.setKeySignature(acc, minor));
            expect(bytes[22 + 3]).toBe(0x02); // length byte after FF 59
        }
    });
});

// ---------------------------------------------------------------------------
// 8. MIDI Channel Events — Note On and Note Off
// ---------------------------------------------------------------------------

describe('MIDI channel events', () => {
    // Spec: Note On  = 0x9n note velocity (3 bytes, n = channel 0-15)
    //       Note Off = 0x8n note velocity (3 bytes, n = channel 0-15)
    // Middle C = MIDI note 60 = 0x3C

    describe('Note On', () => {
        it('Note On for middle C (60) on channel 0 with velocity 90 produces 0x90 0x3C 0x5A', () => {
            const bytes = singleTrackFile(t => t.addNoteOn(0, 60, 0, 90));
            const eventOffset = 22;

            expect(bytes[eventOffset]).toBe(0x00); // delta time = 0
            expect(bytes[eventOffset + 1]).toBe(0x90); // Note On, channel 0
            expect(bytes[eventOffset + 2]).toBe(0x3C); // note 60 = middle C
            expect(bytes[eventOffset + 3]).toBe(0x5A); // velocity 90 = 0x5A
        });

        it('Note On on channel 9 (drum channel) produces status byte 0x99', () => {
            const bytes = singleTrackFile(t => t.addNoteOn(9, 60, 0, 100));
            const eventOffset = 22;

            expect(bytes[eventOffset + 1]).toBe(0x99); // 0x90 | 9 = 0x99
        });

        it('Note On on channel 15 produces status byte 0x9F', () => {
            const bytes = singleTrackFile(t => t.addNoteOn(15, 60, 0, 80));
            const eventOffset = 22;

            expect(bytes[eventOffset + 1]).toBe(0x9F); // 0x90 | 15 = 0x9F
        });
    });

    describe('Note Off', () => {
        it('Note Off for middle C (60) on channel 0 produces 0x80 0x3C', () => {
            const bytes = singleTrackFile(t => t.addNoteOff(0, 60, 0, 0));
            const eventOffset = 22;

            expect(bytes[eventOffset]).toBe(0x00); // delta time = 0
            expect(bytes[eventOffset + 1]).toBe(0x80); // Note Off, channel 0
            expect(bytes[eventOffset + 2]).toBe(0x3C); // note 60 = middle C
        });

        it('Note Off on channel 1 produces status byte 0x81', () => {
            const bytes = singleTrackFile(t => t.addNoteOff(1, 60, 0, 0));
            const eventOffset = 22;

            expect(bytes[eventOffset + 1]).toBe(0x81); // 0x80 | 1
        });
    });

    describe('Note event byte length', () => {
        it('a Note On event is exactly 3 bytes (excluding delta time)', () => {
            // The event bytes for a Note On at delta=0 are: [0x00, status, note, velocity]
            // That is 1 (delta) + 3 (event) = 4 bytes total in the stream.
            const withNote = singleTrackFile(t => t.addNoteOn(0, 60, 0, 90));
            const empty = singleTrackFile(() => {});

            const withNoteLength = readUint32BE(withNote, 18); // bytes 18-21 = track data length
            const emptyLength    = readUint32BE(empty,    18);

            // Note On contributes: 1 (delta) + 1 (status) + 1 (note) + 1 (velocity) = 4 bytes
            expect(withNoteLength - emptyLength).toBe(4);
        });
    });
});

// ---------------------------------------------------------------------------
// 9. Program Change Event (0xCn program — 2 bytes)
// ---------------------------------------------------------------------------

describe('Program Change event', () => {
    // Spec: Program Change = 0xCn followed by 1 parameter byte (program number).
    // Unlike Note On/Off there is NO second parameter byte.

    it('channel 0, instrument 0x13 produces status 0xC0 followed only by 0x13', () => {
        const bytes = singleTrackFile(t => t.setInstrument(0, 0x13));
        const eventOffset = 22;

        expect(bytes[eventOffset]).toBe(0x00); // delta time
        expect(bytes[eventOffset + 1]).toBe(0xC0); // Program Change, channel 0
        expect(bytes[eventOffset + 2]).toBe(0x13); // instrument 0x13 = 19

        // The byte immediately after 0x13 must be the End of Track delta (0x00),
        // not a second parameter byte.  This confirms only 2 event bytes are written.
        expect(bytes[eventOffset + 3]).toBe(0x00); // delta of End of Track
        expect(bytes[eventOffset + 4]).toBe(0xFF); // FF of End of Track
    });

    it('Program Change event contributes exactly 3 bytes (delta + status + program)', () => {
        const withPC = singleTrackFile(t => t.setInstrument(0, 0x00));
        const empty  = singleTrackFile(() => {});

        const withPCLength = readUint32BE(withPC, 18);
        const emptyLength  = readUint32BE(empty,  18);

        // delta(1) + status(1) + program(1) = 3 bytes
        expect(withPCLength - emptyLength).toBe(3);
    });

    it('channel 3, instrument 0x28 (acoustic bass) produces status 0xC3', () => {
        const bytes = singleTrackFile(t => t.setInstrument(3, 0x28));
        const eventOffset = 22;

        expect(bytes[eventOffset + 1]).toBe(0xC3); // 0xC0 | 3
        expect(bytes[eventOffset + 2]).toBe(0x28); // instrument
    });
});

// ---------------------------------------------------------------------------
// 10. Track Length Accuracy
// ---------------------------------------------------------------------------

describe('Track length field accuracy', () => {
    // The 4 bytes after "MTrk" must exactly equal the number of bytes that follow
    // them in that track chunk.

    it('stored track length matches actual remaining bytes with multiple events', () => {
        const bytes = singleTrackFile(t => {
            t.setTempo(120);
            t.setTimeSignature(4, 4);
            t.setKeySignature(0, false);
            t.addNoteOn(0, 60, 0, 90);
            t.addNoteOff(0, 60, 128, 0);
            t.addNoteOn(0, 64, 0, 90);
            t.addNoteOff(0, 64, 128, 0);
        });

        const storedLength = readUint32BE(bytes, 18);
        const actualRemaining = bytes.length - 22;

        expect(storedLength).toBe(actualRemaining);
    });

    it('stored track length matches actual remaining bytes for each track in a multi-track file', () => {
        const file = new File();
        const t1 = file.addTrack();
        t1.setTempo(120);
        t1.setTimeSignature(4, 4);

        const t2 = file.addTrack();
        t2.addNoteOn(0, 60, 0, 90);
        t2.addNoteOff(0, 60, 128, 0);

        const bytes = file.toUint8Array();

        // --- Track 1 ---
        const t1DataLen = readUint32BE(bytes, 14 + 4);
        // Simpler: the chunk says its own length; verify total file size is consistent
        const t2Start = 14 + 8 + t1DataLen;
        const t2DataLen = readUint32BE(bytes, t2Start + 4);

        expect(bytes.length).toBe(14 + 8 + t1DataLen + 8 + t2DataLen);

        // For each track, verify stored length equals actual remaining bytes in chunk
        const t1Remaining = bytes.length - (14 + 8) - t2DataLen - 8;
        expect(t1DataLen).toBe(t1Remaining);

        const t2Actual = bytes.length - (t2Start + 8);
        expect(t2DataLen).toBe(t2Actual);
    });
});

// ---------------------------------------------------------------------------
// 11. Multi-Track File Completeness
// ---------------------------------------------------------------------------

describe('Multi-track file (format 1) completeness', () => {
    it('3 tracks: header ntracks = 0x00 0x03 and format = 0x00 0x01', () => {
        const file = new File({ticks: 480});
        file.addTrack(new Track()); // tempo track
        file.addTrack(new Track()); // melody track
        file.addTrack(new Track()); // harmony track

        const bytes = file.toUint8Array();

        expect(bytes[8]).toBe(0x00);  // format high byte
        expect(bytes[9]).toBe(0x01);  // format low byte  (type 1)
        expect(bytes[10]).toBe(0x00); // ntracks high byte
        expect(bytes[11]).toBe(0x03); // ntracks low byte
    });

    it('3 tracks: the file contains exactly 3 MTrk chunks', () => {
        const file = new File();
        const t1 = file.addTrack();
        t1.setTempo(120);

        const t2 = file.addTrack();
        t2.addNote(0, 60, 64);

        const t3 = file.addTrack();
        t3.addNote(0, 64, 64);

        const bytes = file.toUint8Array();

        // Count occurrences of "MTrk" (0x4D 0x54 0x72 0x6B) in the byte stream.
        let mtrkCount = 0;
        for (let i = 0; i < bytes.length - 3; i++) {
            if (
                bytes[i]     === 0x4D &&
                bytes[i + 1] === 0x54 &&
                bytes[i + 2] === 0x72 &&
                bytes[i + 3] === 0x6B
            ) {
                mtrkCount++;
            }
        }

        expect(mtrkCount).toBe(3);
    });

    it('3 tracks: file.tracks.length equals the ntracks value in the header', () => {
        const file = new File();
        file.addTrack(new Track());
        file.addTrack(new Track());
        file.addTrack(new Track());

        const bytes = file.toUint8Array();
        const headerNtracks = (bytes[10] << 8) | bytes[11];

        expect(headerNtracks).toBe(file.tracks.length);
        expect(headerNtracks).toBe(3);
    });

    it('each track in a 3-track file ends with the End of Track sequence', () => {
        const file = new File();
        const tracks = [file.addTrack(), file.addTrack(), file.addTrack()];
        tracks[0].setTempo(120);
        tracks[1].addNoteOn(0, 60, 0, 90);
        tracks[2].addNoteOn(0, 64, 0, 90);

        const bytes = file.toUint8Array();

        // Walk each track and inspect its final 4 bytes
        let offset = 14;
        for (let i = 0; i < 3; i++) {
            const dataLen = readUint32BE(bytes, offset + 4);
            const chunkEnd = offset + 8 + dataLen;

            expect(bytes[chunkEnd - 4]).toBe(0x00); // End of Track delta
            expect(bytes[chunkEnd - 3]).toBe(0xFF);
            expect(bytes[chunkEnd - 2]).toBe(0x2F);
            expect(bytes[chunkEnd - 1]).toBe(0x00);

            offset = chunkEnd;
        }
    });

    it('the total file size equals 14 (MThd) + sum of all track chunk sizes', () => {
        const file = new File({ticks: 480});
        const t1 = file.addTrack();
        t1.setTempo(120);
        t1.setTimeSignature(4, 4);

        const t2 = file.addTrack();
        t2.addNote(0, 60, 128, 0, 90);
        t2.addNote(0, 62, 128, 128, 90);

        const t3 = file.addTrack();
        t3.addNote(0, 64, 128, 0, 80);

        const bytes = file.toUint8Array();

        let offset = 14;
        let totalTrackBytes = 0;
        for (let i = 0; i < 3; i++) {
            const dataLen = readUint32BE(bytes, offset + 4);
            totalTrackBytes += 8 + dataLen; // 4 (MTrk id) + 4 (length field) + dataLen
            offset += 8 + dataLen;
        }

        expect(bytes.length).toBe(14 + totalTrackBytes);
    });
});
