import {File, Track, MetaEvent, parseMidi} from '../src';
import {noteFromMidiPitch} from '../src/Util';
import type {MidiChannelEvent, MidiMetaEvent} from '../src';
import {asChannel, asMeta} from './helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(configure: (track: Track) => void, ticks = 128): Uint8Array {
    const file = new File({ticks});
    const track = file.addTrack();
    configure(track);
    return file.toUint8Array();
}

// ---------------------------------------------------------------------------
// 1. Header parsing
// ---------------------------------------------------------------------------

describe('parseMidi — header', () => {
    it('parses ticksPerBeat from a single-track file', () => {
        const result = parseMidi(makeFile(() => {}, 480));
        expect(result.header.ticksPerBeat).toBe(480);
    });

    it('reports format 0 for a single-track file', () => {
        const result = parseMidi(makeFile(() => {}));
        expect(result.header.format).toBe(0);
    });

    it('reports format 1 for a multi-track file', () => {
        const file = new File();
        file.addTrack(new Track());
        file.addTrack(new Track());
        const result = parseMidi(file.toUint8Array());
        expect(result.header.format).toBe(1);
    });

    it('reports numTracks = 1 for a single-track file', () => {
        const result = parseMidi(makeFile(() => {}));
        expect(result.header.numTracks).toBe(1);
    });

    it('reports numTracks = 3 for a three-track file', () => {
        const file = new File();
        file.addTrack(new Track());
        file.addTrack(new Track());
        file.addTrack(new Track());
        const result = parseMidi(file.toUint8Array());
        expect(result.header.numTracks).toBe(3);
    });

    it('returns no errors for a valid file', () => {
        const result = parseMidi(makeFile(() => {}));
        expect(result.errors).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 2. Error handling
// ---------------------------------------------------------------------------

describe('parseMidi — error handling', () => {
    it('does not throw on truncated input', () => {
        expect(() => parseMidi(new Uint8Array([0x4D, 0x54]))).not.toThrow();
    });

    it('returns an error for input shorter than 14 bytes', () => {
        const result = parseMidi(new Uint8Array(8));
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].message).toMatch(/too short/i);
    });

    it('returns an error for wrong magic bytes', () => {
        const bytes = makeFile(() => {}).slice();
        bytes[0] = 0x00; // corrupt "MThd"
        const result = parseMidi(bytes);
        expect(result.errors.some(e => e.message.includes('MThd'))).toBe(true);
    });

    it('returns an error for wrong MTrk magic', () => {
        const bytes = makeFile(() => {}).slice();
        bytes[14] = 0x00; // corrupt "MTrk"
        const result = parseMidi(bytes);
        expect(result.errors.some(e => e.message.includes('MTrk'))).toBe(true);
    });

    it('returns an empty tracks array for a too-short file', () => {
        const result = parseMidi(new Uint8Array(4));
        expect(result.tracks).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 3. Meta event parsing
// ---------------------------------------------------------------------------

describe('parseMidi — meta events', () => {
    it('parses a tempo meta event and decodes bpm', () => {
        const bytes = makeFile(t => t.setTempo(120));
        const result = parseMidi(bytes);
        const tempoEvent = result.tracks[0].events.find(
            e => e.type === 'meta' && (e as MidiMetaEvent).subtype === 'tempo',
        ) as MidiMetaEvent | undefined;
        expect(tempoEvent).toBeDefined();
        expect(tempoEvent?.bpm).toBe(120);
    });

    it('parses a time signature meta event', () => {
        const bytes = makeFile(t => t.setTimeSignature(3, 4));
        const result = parseMidi(bytes);
        const tse = result.tracks[0].events.find(
            e => e.type === 'meta' && (e as MidiMetaEvent).subtype === 'timeSignature',
        ) as MidiMetaEvent | undefined;
        expect(tse).toBeDefined();
        expect(tse?.numerator).toBe(3);
        expect(tse?.denominator).toBe(4);
    });

    it('parses a key signature meta event', () => {
        const bytes = makeFile(t => t.setKeySignature(2, false));
        const result = parseMidi(bytes);
        const kse = result.tracks[0].events.find(
            e => e.type === 'meta' && (e as MidiMetaEvent).subtype === 'keySignature',
        ) as MidiMetaEvent | undefined;
        expect(kse).toBeDefined();
        expect(kse?.accidentals).toBe(2);
        expect(kse?.minor).toBe(false);
    });

    it('parses a minor key signature correctly', () => {
        const bytes = makeFile(t => t.setKeySignature(-1, true));
        const result = parseMidi(bytes);
        const kse = result.tracks[0].events.find(
            e => e.type === 'meta' && (e as MidiMetaEvent).subtype === 'keySignature',
        ) as MidiMetaEvent | undefined;
        expect(kse?.accidentals).toBe(-1);
        expect(kse?.minor).toBe(true);
    });

    it('always has an endOfTrack event as the last event', () => {
        const bytes = makeFile(t => t.addNoteOn(0, 60));
        const result = parseMidi(bytes);
        const events = result.tracks[0].events;
        const last = asMeta(events[events.length - 1]);
        expect(last.subtype).toBe('endOfTrack');
    });

    it('parses a trackName meta event and decodes text', () => {
        const track = new Track();
        track.addEvent(new MetaEvent({type: MetaEvent.TRACK_NAME, data: 'Piano', time: 0}));
        const file = new File();
        file.addTrack(track);
        const result = parseMidi(file.toUint8Array());
        const nameEvent = result.tracks[0].events.find(
            e => e.type === 'meta' && (e as MidiMetaEvent).subtype === 'trackName',
        ) as MidiMetaEvent | undefined;
        expect(nameEvent?.text).toBe('Piano');
    });
});

// ---------------------------------------------------------------------------
// 4. Channel event parsing
// ---------------------------------------------------------------------------

describe('parseMidi — channel events', () => {
    it('parses a note-on event', () => {
        const bytes = makeFile(t => t.addNoteOn(0, 60, 0, 90));
        const result = parseMidi(bytes);
        const noteOn = result.tracks[0].events.find(
            e => e.type === 'channel' && (e as MidiChannelEvent).subtype === 'noteOn',
        ) as MidiChannelEvent | undefined;
        expect(noteOn).toBeDefined();
        expect(noteOn?.param1).toBe(60);
        expect(noteOn?.param2).toBe(90);
        expect(noteOn?.channel).toBe(0);
    });

    it('parses a note-off event', () => {
        const bytes = makeFile(t => t.addNoteOff(0, 60, 128));
        const result = parseMidi(bytes);
        const noteOff = result.tracks[0].events.find(
            e => e.type === 'channel' && (e as MidiChannelEvent).subtype === 'noteOff',
        ) as MidiChannelEvent | undefined;
        expect(noteOff).toBeDefined();
        expect(noteOff?.param1).toBe(60);
    });

    it('parses a program change event', () => {
        const bytes = makeFile(t => t.setInstrument(0, 40));
        const result = parseMidi(bytes);
        const pc = result.tracks[0].events.find(
            e => e.type === 'channel' && (e as MidiChannelEvent).subtype === 'programChange',
        ) as MidiChannelEvent | undefined;
        expect(pc).toBeDefined();
        expect(pc?.param1).toBe(40);
    });

    it('parses correct deltaTime on note-off', () => {
        const bytes = makeFile(t => {
            t.addNoteOn(0, 60, 0, 90);
            t.addNoteOff(0, 60, 128);
        });
        const result = parseMidi(bytes);
        const noteOff = result.tracks[0].events.find(
            e => e.type === 'channel' && (e as MidiChannelEvent).subtype === 'noteOff',
        ) as MidiChannelEvent | undefined;
        expect(noteOff?.deltaTime).toBe(128);
    });

    it('parses channel number correctly', () => {
        const bytes = makeFile(t => t.addNoteOn(9, 36, 0, 100)); // channel 9 = drums
        const result = parseMidi(bytes);
        const noteOn = result.tracks[0].events.find(
            e => e.type === 'channel' && (e as MidiChannelEvent).subtype === 'noteOn',
        ) as MidiChannelEvent | undefined;
        expect(noteOn?.channel).toBe(9);
    });
});

// ---------------------------------------------------------------------------
// 5. Round-trip tests
// ---------------------------------------------------------------------------

describe('parseMidi — round-trips', () => {
    it('round-trips ticksPerBeat for various values', () => {
        for (const ticks of [96, 120, 128, 240, 480, 960]) {
            const result = parseMidi(makeFile(() => {}, ticks));
            expect(result.header.ticksPerBeat).toBe(ticks);
        }
    });

    it('round-trips a file with tempo + time sig + multiple notes', () => {
        const bytes = makeFile(t => {
            t.setTempo(140);
            t.setTimeSignature(4, 4);
            t.addNoteOn(0, 60, 0, 80);
            t.addNoteOff(0, 60, 96);
            t.addNoteOn(0, 64, 0, 80);
            t.addNoteOff(0, 64, 96);
        });
        const result = parseMidi(bytes);
        const events = result.tracks[0].events;
        const tempo = events.find(e => e.type === 'meta' && asMeta(e).subtype === 'tempo') as MidiMetaEvent;
        expect(tempo?.bpm).toBe(140);
        const notes = events.filter(e => e.type === 'channel' && asChannel(e).subtype === 'noteOn');
        expect(notes).toHaveLength(2);
    });

    it('round-trips a multi-track file — correct track count', () => {
        const file = new File();
        const t1 = file.addTrack();
        t1.addNoteOn(0, 60, 0);
        t1.addNoteOff(0, 60, 128);
        const t2 = file.addTrack();
        t2.addNoteOn(1, 64, 0);
        t2.addNoteOff(1, 64, 128);
        const result = parseMidi(file.toUint8Array());
        expect(result.tracks).toHaveLength(2);
    });

    it('round-trips a multi-track file — events in each track', () => {
        const file = new File();
        const t1 = file.addTrack();
        t1.setTempo(100);
        t1.addNoteOn(0, 60, 0, 90);
        const t2 = file.addTrack();
        t2.addNoteOn(1, 72, 0, 70);
        const result = parseMidi(file.toUint8Array());

        const t1Tempo = result.tracks[0].events.find(
            e => e.type === 'meta' && asMeta(e).subtype === 'tempo',
        ) as MidiMetaEvent;
        expect(t1Tempo?.bpm).toBe(100);

        const t2NoteOn = result.tracks[1].events.find(
            e => e.type === 'channel' && asChannel(e).subtype === 'noteOn',
        ) as MidiChannelEvent;
        expect(t2NoteOn?.param1).toBe(72);
        expect(t2NoteOn?.channel).toBe(1);
    });

    it('round-trips 50 notes in a single track', () => {
        const bytes = makeFile(t => {
            for (let i = 0; i < 50; i++) {
                t.addNoteOn(0, 48 + (i % 12), 0, 80);
                t.addNoteOff(0, 48 + (i % 12), 64);
            }
        });
        const result = parseMidi(bytes);
        const channelEvents = result.tracks[0].events.filter(e => e.type === 'channel');
        expect(channelEvents).toHaveLength(100); // 50 on + 50 off
    });

    it('velocity=0 note-on is normalized to noteOff', () => {
        const bytes = makeFile(t => t.addNoteOn(0, 60, 0, 0));
        const result = parseMidi(bytes);
        // velocity=0 noteOn is treated as noteOff per MIDI spec
        const ev = result.tracks[0].events.find(
            e => e.type === 'channel',
        ) as MidiChannelEvent;
        expect(ev.subtype).toBe('noteOff');
        expect(ev.param2).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// 6. Running status
// ---------------------------------------------------------------------------

describe('parseMidi — running status', () => {
    it('handles two noteOns sharing a single status byte', () => {
        // Hand-crafted MTrk: delta=0, status=0x90 (noteOn ch0), note=60, vel=90,
        //                     delta=0, note=64, vel=80 (running status — no re-emitted 0x90)
        const trackData = [
            0x00, 0x90, 0x3C, 0x5A, // noteOn, pitch 60, velocity 90
            0x00, 0x40, 0x50,        // running status: noteOn, pitch 64, velocity 80
            0x00, 0xFF, 0x2F, 0x00,  // endOfTrack
        ];
        const header = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0x80];
        const trackHeader = [0x4D, 0x54, 0x72, 0x6B, 0, 0, 0, trackData.length];
        const bytes = new Uint8Array([...header, ...trackHeader, ...trackData]);
        const result = parseMidi(bytes);
        const channelEvents = result.tracks[0].events.filter(e => e.type === 'channel') as MidiChannelEvent[];
        expect(channelEvents).toHaveLength(2);
        expect(channelEvents[0].param1).toBe(60);
        expect(channelEvents[0].param2).toBe(90);
        expect(channelEvents[1].param1).toBe(64);
        expect(channelEvents[1].param2).toBe(80);
    });

    it('running status is reset after a meta event', () => {
        // noteOn, then endOfTrack (meta resets status), no further channel events
        const trackData = [
            0x00, 0x90, 0x3C, 0x5A,  // noteOn ch0 pitch=60 vel=90
            0x00, 0xFF, 0x2F, 0x00,   // endOfTrack — resets running status
        ];
        const header = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0x80];
        const trackHeader = [0x4D, 0x54, 0x72, 0x6B, 0, 0, 0, trackData.length];
        const bytes = new Uint8Array([...header, ...trackHeader, ...trackData]);
        const result = parseMidi(bytes);
        const channelEvents = result.tracks[0].events.filter(e => e.type === 'channel');
        expect(channelEvents).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 7. noteFromMidiPitch flat names
// ---------------------------------------------------------------------------

describe('noteFromMidiPitch — returnFlattened', () => {
    it('returns flat names when returnFlattened=true', () => {
        expect(noteFromMidiPitch(61, true)).toBe('db4');  // c#4 → db4
        expect(noteFromMidiPitch(63, true)).toBe('eb4');  // d#4 → eb4
        expect(noteFromMidiPitch(70, true)).toBe('bb4');  // a#4 → bb4
        expect(noteFromMidiPitch(66, true)).toBe('gb4');  // f#4 → gb4
        expect(noteFromMidiPitch(68, true)).toBe('ab4');  // g#4 → ab4
    });

    it('returns sharp names unchanged when returnFlattened=false (default)', () => {
        expect(noteFromMidiPitch(61)).toBe('c#4');
        expect(noteFromMidiPitch(70)).toBe('a#4');
    });

    it('natural notes are unaffected by returnFlattened', () => {
        expect(noteFromMidiPitch(60, true)).toBe('c4');
        expect(noteFromMidiPitch(69, true)).toBe('a4');
    });
});

// ---------------------------------------------------------------------------
// 8. ParseError.offset
// ---------------------------------------------------------------------------

describe('parseMidi — ParseError.offset', () => {
    it('reports offset 0 for too-short input', () => {
        const result = parseMidi(new Uint8Array(8));
        expect(result.errors[0].offset).toBe(0);
    });

    it('reports offset 0 for wrong MThd magic', () => {
        const bytes = makeFile(() => {}).slice();
        bytes[0] = 0x00;
        const result = parseMidi(bytes);
        const mThdError = result.errors.find(e => e.message.includes('MThd'));
        expect(mThdError).toBeDefined();
        expect(mThdError!.offset).toBe(0);
    });

    it('reports the track offset for wrong MTrk magic', () => {
        const bytes = makeFile(() => {}).slice();
        bytes[14] = 0x00; // corrupt first byte of MTrk chunk ID
        const result = parseMidi(bytes);
        const mTrkError = result.errors.find(e => e.message.includes('MTrk'));
        expect(mTrkError).toBeDefined();
        expect(mTrkError!.offset).toBe(14); // track chunk starts at byte 14
    });
});
