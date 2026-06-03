import {File, Track, MetaEvent, parseMidi} from '../src';
import type {MidiChannelEvent} from '../src';

describe('Track — integration', () => {
    describe('building a MIDI file with notes', () => {
        let file: File;
        let track: Track;

        beforeEach(() => {
            file = new File();
            track = new Track();
            file.addTrack(track);
        });

        it('contains exactly 3 note-on events', () => {
            track.addNote(0, 'c4', 64);
            track.addNote(0, 'e4', 64);
            track.addNote(0, 'g4', 64);

            const result = parseMidi(file.toUint8Array());
            const noteOns = result.tracks[0].events.filter(
                e => e.type === 'channel' && (e as MidiChannelEvent).subtype === 'noteOn',
            );
            expect(noteOns).toHaveLength(3);
        });

        it('contains exactly 1 note-off event', () => {
            track.addNote(0, 'c4', 64);

            const result = parseMidi(file.toUint8Array());
            const noteOffs = result.tracks[0].events.filter(
                e => e.type === 'channel' && (e as MidiChannelEvent).subtype === 'noteOff',
            );
            expect(noteOffs).toHaveLength(1);
        });
    });

    describe('method chaining', () => {
        it('supports fluent API via addTrack()', () => {
            const file = new File();
            const track = file.addTrack();

            track
                .addNote(0, 'c4', 32)
                .addNote(0, 'd4', 32)
                .addNote(0, 'e4', 32)
                .setInstrument(0, 0x13)
                .addNoteOn(0, 'c4', 64)
                .addNoteOn(0, 'e4')
                .addNoteOn(0, 'g4')
                .addNoteOff(0, 'c4', 47)
                .addNoteOff(0, 'e4')
                .addNoteOff(0, 'g4');

            const bytes = file.toUint8Array();
            expect(bytes.length).toBeGreaterThan(20);
            expect(bytes[0]).toBe('M'.charCodeAt(0));
        });
    });

    describe('chords', () => {
        it('generates multiple note-on events for a chord', () => {
            const file = new File();
            const track = new Track();
            file.addTrack(track);
            track.addChord(0, ['c4', 'e4', 'g4'], 128);

            const result = parseMidi(file.toUint8Array());
            const noteOns = result.tracks[0].events.filter(
                e => e.type === 'channel' && (e as MidiChannelEvent).subtype === 'noteOn',
            );
            expect(noteOns).toHaveLength(3);
        });

        it('throws on empty chord', () => {
            const track = new Track();
            expect(() => track.addChord(0, [], 128)).toThrow('Chord must be an array of pitches');
        });
    });

    describe('time signature', () => {
        it('throws on non-power-of-2 denominator', () => {
            const track = new Track();
            expect(() => track.setTimeSignature(4, 3)).toThrow('power of 2');
        });
    });

    describe('multi-track file', () => {
        it('sets type 1 for multiple tracks', () => {
            const file = new File();
            file.addTrack(new Track());
            file.addTrack(new Track());

            const bytes = file.toUint8Array();
            expect(bytes[8]).toBe(0x00);
            expect(bytes[9]).toBe(0x01);
        });

        it('sets type 0 for single track', () => {
            const file = new File();
            file.addTrack(new Track());

            const bytes = file.toUint8Array();
            expect(bytes[8]).toBe(0x00);
            expect(bytes[9]).toBe(0x00);
        });
    });

    describe('velocity = 0 handling', () => {
        it('addNoteOn with velocity 0 produces param2 = 0 (not DEFAULT_VOLUME)', () => {
            const track = new Track();
            track.addNoteOn(0, 60, 0, 0);
            const event = track.events[0] as import('../src/MidiEvent').MidiEvent;
            expect(event.param2).toBe(0);
        });

        it('addNoteOff with velocity 0 produces param2 = 0 (not DEFAULT_VOLUME)', () => {
            const track = new Track();
            track.addNoteOff(0, 60, 0, 0);
            const event = track.events[0] as import('../src/MidiEvent').MidiEvent;
            expect(event.param2).toBe(0);
        });

        it('addNoteOn with velocity omitted still uses DEFAULT_VOLUME (90)', () => {
            const track = new Track();
            track.addNoteOn(0, 60);
            const event = track.events[0] as import('../src/MidiEvent').MidiEvent;
            expect(event.param2).toBe(90);
        });
    });

    describe('MidiEvent constructor validation', () => {
        it('throws on channel > 15', () => {
            expect(() => new (require('../src/MidiEvent').MidiEvent)({
                type: 0x90, channel: 16, param1: 60,
            })).toThrow('Channel is out of bounds');
        });

        it('throws on channel < 0', () => {
            expect(() => new (require('../src/MidiEvent').MidiEvent)({
                type: 0x90, channel: -1, param1: 60,
            })).toThrow('Channel is out of bounds');
        });

        it('throws on unknown event type', () => {
            expect(() => new (require('../src/MidiEvent').MidiEvent)({
                type: 0x70, channel: 0, param1: 60,
            })).toThrow();
        });
    });

    describe('addNote with dur=0', () => {
        it('emits only noteOn with no noteOff when dur=0', () => {
            const track = new Track();
            track.addNote(0, 60, 0);
            expect(track.events).toHaveLength(1);
            const event = track.events[0] as import('../src/MidiEvent').MidiEvent;
            expect(event.type).toBe(0x90); // MidiEvent.NOTE_ON
        });
    });

    describe('MetaEvent SEQUENCE type (type=0) serialization', () => {
        it('MetaEvent with type SEQUENCE (0x00) serializes without throwing', () => {
            const event = new MetaEvent({ type: MetaEvent.SEQUENCE });
            expect(() => event.toBytes()).not.toThrow();
        });

        it('MetaEvent SEQUENCE toBytes produces [delta=0, 0xFF, 0x00, length=0]', () => {
            const event = new MetaEvent({ type: MetaEvent.SEQUENCE });
            const bytes = event.toBytes();
            // Structure: [delta-time=0x00, meta-marker=0xFF, type=0x00, data-length=0x00]
            expect(bytes[0]).toBe(0x00); // delta time
            expect(bytes[1]).toBe(0xFF); // meta marker
            expect(bytes[2]).toBe(0x00); // SEQUENCE type
            expect(bytes[3]).toBe(0x00); // data length
        });
    });
});
