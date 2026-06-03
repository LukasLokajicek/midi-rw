import {File, Track, MetaEvent, parseMidi, writeMidi} from '../src';
import type {MidiChannelEvent, MidiMetaEvent, MidiData} from '../src';
import {asChannel, asMeta} from './helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTrip(configure: (track: Track) => void, ticks = 128): MidiData {
    const file = new File({ticks});
    const track = file.addTrack();
    configure(track);
    const parsed = parseMidi(file.toUint8Array());
    const rewritten = writeMidi(parsed);
    return parseMidi(rewritten);
}

// ---------------------------------------------------------------------------
// 1. Header round-trips
// ---------------------------------------------------------------------------

describe('writeMidi — header round-trips', () => {
    it('preserves ticksPerBeat', () => {
        for (const ticks of [96, 120, 240, 480, 960]) {
            const result = roundTrip(() => {}, ticks);
            expect(result.header.ticksPerBeat).toBe(ticks);
        }
    });

    it('preserves format 0 for single-track', () => {
        const result = roundTrip(() => {});
        expect(result.header.format).toBe(0);
    });

    it('preserves format 1 for multi-track', () => {
        const file = new File();
        file.addTrack(new Track());
        file.addTrack(new Track());
        const rewritten = writeMidi(parseMidi(file.toUint8Array()));
        const result = parseMidi(rewritten);
        expect(result.header.format).toBe(1);
        expect(result.header.numTracks).toBe(2);
    });

    it('produces no errors on a clean round-trip', () => {
        const result = roundTrip(t => { t.setTempo(120); t.addNoteOn(0, 60, 0, 90); });
        expect(result.errors).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 2. Channel event round-trips
// ---------------------------------------------------------------------------

describe('writeMidi — channel event round-trips', () => {
    it('preserves noteOn pitch, velocity, channel', () => {
        const result = roundTrip(t => t.addNoteOn(3, 72, 0, 100));
        const noteOn = result.tracks[0].events.find(
            e => e.type === 'channel' && asChannel(e).subtype === 'noteOn',
        ) as MidiChannelEvent;
        expect(noteOn.param1).toBe(72);
        expect(noteOn.param2).toBe(100);
        expect(noteOn.channel).toBe(3);
        expect(noteOn.noteNumber).toBe(72);
        expect(noteOn.velocity).toBe(100);
    });

    it('preserves noteOff', () => {
        const result = roundTrip(t => { t.addNoteOn(0, 60, 0, 90); t.addNoteOff(0, 60, 64); });
        const noteOff = result.tracks[0].events.find(
            e => e.type === 'channel' && asChannel(e).subtype === 'noteOff',
        ) as MidiChannelEvent;
        expect(noteOff).toBeDefined();
        expect(noteOff.noteNumber).toBe(60);
    });

    it('preserves programChange', () => {
        const result = roundTrip(t => t.setInstrument(0, 40));
        const pc = result.tracks[0].events.find(
            e => e.type === 'channel' && asChannel(e).subtype === 'programChange',
        ) as MidiChannelEvent;
        expect(pc?.program).toBe(40);
    });

    it('preserves deltaTime', () => {
        const result = roundTrip(t => {
            t.addNoteOn(0, 60, 0, 90);
            t.addNoteOff(0, 60, 192);
        });
        const noteOff = result.tracks[0].events.find(
            e => e.type === 'channel' && asChannel(e).subtype === 'noteOff',
        ) as MidiChannelEvent;
        expect(noteOff?.deltaTime).toBe(192);
    });

    it('round-trips 50 notes without loss', () => {
        const result = roundTrip(t => {
            for (let i = 0; i < 50; i++) {
                t.addNoteOn(0, 48 + (i % 12), 0, 80);
                t.addNoteOff(0, 48 + (i % 12), 64);
            }
        });
        const channelEvents = result.tracks[0].events.filter(e => e.type === 'channel');
        expect(channelEvents).toHaveLength(100);
    });

    it('drum channel (9) round-trips correctly', () => {
        const result = roundTrip(t => t.addNoteOn(9, 36, 0, 100));
        const noteOn = result.tracks[0].events.find(
            e => e.type === 'channel' && asChannel(e).subtype === 'noteOn',
        ) as MidiChannelEvent;
        expect(noteOn?.channel).toBe(9);
    });
});

// ---------------------------------------------------------------------------
// 3. Meta event round-trips
// ---------------------------------------------------------------------------

describe('writeMidi — meta event round-trips', () => {
    it('preserves tempo', () => {
        const result = roundTrip(t => t.setTempo(140));
        const tempo = result.tracks[0].events.find(
            e => e.type === 'meta' && asMeta(e).subtype === 'tempo',
        ) as MidiMetaEvent;
        expect(tempo?.bpm).toBe(140);
    });

    it('preserves time signature', () => {
        const result = roundTrip(t => t.setTimeSignature(3, 8));
        const tse = result.tracks[0].events.find(
            e => e.type === 'meta' && asMeta(e).subtype === 'timeSignature',
        ) as MidiMetaEvent;
        expect(tse?.numerator).toBe(3);
        expect(tse?.denominator).toBe(8);
    });

    it('preserves key signature (sharps)', () => {
        const result = roundTrip(t => t.setKeySignature(2, false));
        const kse = result.tracks[0].events.find(
            e => e.type === 'meta' && asMeta(e).subtype === 'keySignature',
        ) as MidiMetaEvent;
        expect(kse?.accidentals).toBe(2);
        expect(kse?.minor).toBe(false);
    });

    it('preserves key signature (flats, minor)', () => {
        const result = roundTrip(t => t.setKeySignature(-3, true));
        const kse = result.tracks[0].events.find(
            e => e.type === 'meta' && asMeta(e).subtype === 'keySignature',
        ) as MidiMetaEvent;
        expect(kse?.accidentals).toBe(-3);
        expect(kse?.minor).toBe(true);
    });

    it('preserves trackName text', () => {
        const track = new Track();
        track.addEvent(new MetaEvent({type: MetaEvent.TRACK_NAME, data: 'Strings', time: 0}));
        const file = new File();
        file.addTrack(track);
        const rewritten = writeMidi(parseMidi(file.toUint8Array()));
        const result = parseMidi(rewritten);
        const nameEvent = result.tracks[0].events.find(
            e => e.type === 'meta' && asMeta(e).subtype === 'trackName',
        ) as MidiMetaEvent;
        expect(nameEvent?.text).toBe('Strings');
    });

    it('always ends with endOfTrack', () => {
        const result = roundTrip(t => t.addNoteOn(0, 60, 0, 90));
        const events = result.tracks[0].events;
        const last = asMeta(events[events.length - 1]);
        expect(last.subtype).toBe('endOfTrack');
    });
});

// ---------------------------------------------------------------------------
// 4. Multi-track round-trips
// ---------------------------------------------------------------------------

describe('writeMidi — multi-track round-trips', () => {
    it('preserves track count', () => {
        const file = new File();
        for (let i = 0; i < 4; i++) file.addTrack(new Track());
        const result = parseMidi(writeMidi(parseMidi(file.toUint8Array())));
        expect(result.tracks).toHaveLength(4);
    });

    it('preserves events in each track independently', () => {
        const file = new File();
        const t1 = file.addTrack();
        t1.setTempo(100);
        t1.addNoteOn(0, 60, 0, 90);
        const t2 = file.addTrack();
        t2.addNoteOn(1, 72, 0, 70);
        const result = parseMidi(writeMidi(parseMidi(file.toUint8Array())));

        const t1Tempo = result.tracks[0].events.find(
            e => e.type === 'meta' && asMeta(e).subtype === 'tempo',
        ) as MidiMetaEvent;
        expect(t1Tempo?.bpm).toBe(100);

        const t2Note = result.tracks[1].events.find(
            e => e.type === 'channel' && asChannel(e).subtype === 'noteOn',
        ) as MidiChannelEvent;
        expect(t2Note?.noteNumber).toBe(72);
        expect(t2Note?.channel).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// 5. Semantic aliases
// ---------------------------------------------------------------------------

describe('parseMidi — semantic aliases', () => {
    it('noteOn populates noteNumber and velocity', () => {
        const file = new File();
        const track = file.addTrack();
        track.addNoteOn(0, 64, 0, 80);
        const result = parseMidi(file.toUint8Array());
        const noteOn = result.tracks[0].events.find(
            e => e.type === 'channel' && asChannel(e).subtype === 'noteOn',
        ) as MidiChannelEvent;
        expect(noteOn.noteNumber).toBe(64);
        expect(noteOn.velocity).toBe(80);
    });

    it('noteOff populates noteNumber and velocity', () => {
        const file = new File();
        const track = file.addTrack();
        track.addNoteOff(0, 60, 0);
        const result = parseMidi(file.toUint8Array());
        const noteOff = result.tracks[0].events.find(
            e => e.type === 'channel' && asChannel(e).subtype === 'noteOff',
        ) as MidiChannelEvent;
        expect(noteOff.noteNumber).toBe(60);
    });

    it('programChange populates program', () => {
        const file = new File();
        const track = file.addTrack();
        track.setInstrument(0, 25);
        const result = parseMidi(file.toUint8Array());
        const pc = result.tracks[0].events.find(
            e => e.type === 'channel' && asChannel(e).subtype === 'programChange',
        ) as MidiChannelEvent;
        expect(pc.program).toBe(25);
    });

    it('velocity=0 noteOn is normalized to noteOff', () => {
        const file = new File();
        const track = file.addTrack();
        track.addNoteOn(0, 60, 0, 0); // velocity=0 → should become noteOff
        const result = parseMidi(file.toUint8Array());
        const ev = result.tracks[0].events.find(
            e => e.type === 'channel',
        ) as MidiChannelEvent;
        expect(ev.subtype).toBe('noteOff');
        expect(ev.noteNumber).toBe(60);
    });
});

// ---------------------------------------------------------------------------
// 6. Byte-level spot checks
// ---------------------------------------------------------------------------

describe('writeMidi — byte-level spot checks', () => {
    it('output starts with MThd magic bytes', () => {
        const file = new File();
        file.addTrack(new Track());
        const bytes = writeMidi(parseMidi(file.toUint8Array()));
        expect(bytes[0]).toBe(0x4D); // 'M'
        expect(bytes[1]).toBe(0x54); // 'T'
        expect(bytes[2]).toBe(0x68); // 'h'
        expect(bytes[3]).toBe(0x64); // 'd'
    });

    it('MThd chunk length is always 6 (bytes 4-7)', () => {
        const file = new File();
        file.addTrack(new Track());
        const bytes = writeMidi(parseMidi(file.toUint8Array()));
        expect(bytes[4]).toBe(0);
        expect(bytes[5]).toBe(0);
        expect(bytes[6]).toBe(0);
        expect(bytes[7]).toBe(6);
    });

    it('first track chunk starts with MTrk magic at byte 14', () => {
        const file = new File();
        file.addTrack(new Track());
        const bytes = writeMidi(parseMidi(file.toUint8Array()));
        expect(bytes[14]).toBe(0x4D); // 'M'
        expect(bytes[15]).toBe(0x54); // 'T'
        expect(bytes[16]).toBe(0x72); // 'r'
        expect(bytes[17]).toBe(0x6B); // 'k'
    });

    it('ticksPerBeat 480 is encoded as 0x01E0 at bytes 12-13', () => {
        const file = new File({ticks: 480});
        file.addTrack(new Track());
        const bytes = writeMidi(parseMidi(file.toUint8Array()));
        expect(bytes[12]).toBe(0x01);
        expect(bytes[13]).toBe(0xE0);
    });

    it('noteOn event encodes status byte 0x9n and correct pitch/velocity', () => {
        const file = new File({ticks: 128});
        const track = file.addTrack();
        track.addNoteOn(0, 60, 0, 90);
        const parsed = parseMidi(file.toUint8Array());
        const bytes = writeMidi(parsed);
        // After MThd (14 bytes) + MTrk header (8 bytes) = offset 22
        // delta=0x00, status=0x90, note=0x3C, vel=0x5A
        const trackDataStart = 22;
        expect(bytes[trackDataStart]).toBe(0x00);     // delta time
        expect(bytes[trackDataStart + 1]).toBe(0x90); // noteOn ch0
        expect(bytes[trackDataStart + 2]).toBe(0x3C); // pitch 60
        expect(bytes[trackDataStart + 3]).toBe(0x5A); // velocity 90
    });

    it('tempo meta event encodes as 0xFF 0x51 0x03 followed by 3 MPQN bytes', () => {
        const file = new File({ticks: 128});
        const track = file.addTrack();
        track.setTempo(120); // 120 BPM = 500000 µs = 0x07A120
        const parsed = parseMidi(file.toUint8Array());
        const bytes = writeMidi(parsed);
        const trackDataStart = 22;
        expect(bytes[trackDataStart]).toBe(0x00);     // delta
        expect(bytes[trackDataStart + 1]).toBe(0xFF); // meta
        expect(bytes[trackDataStart + 2]).toBe(0x51); // tempo type
        expect(bytes[trackDataStart + 3]).toBe(0x03); // data length
        expect(bytes[trackDataStart + 4]).toBe(0x07); // MPQN high
        expect(bytes[trackDataStart + 5]).toBe(0xA1); // MPQN mid
        expect(bytes[trackDataStart + 6]).toBe(0x20); // MPQN low
    });
});
