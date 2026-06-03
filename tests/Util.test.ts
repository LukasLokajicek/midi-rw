import {
    codes2Str,
    midi_letter_pitches,
    midiPitchFromNote,
    str2Bytes,
} from '../src/Util';

describe('Midi letter -> pitches', () => {
    it('maps letters to correct pitch values', () => {
        expect(midi_letter_pitches.a).toBe(21);
        expect(midi_letter_pitches.b).toBe(23);
        expect(midi_letter_pitches.c).toBe(12);
        expect(midi_letter_pitches.d).toBe(14);
        expect(midi_letter_pitches.e).toBe(16);
        expect(midi_letter_pitches.f).toBe(17);
        expect(midi_letter_pitches.g).toBe(19);
    });
});

describe('midiPitchFromNote', () => {
    it('converts standard notes to MIDI pitches', () => {
        expect(midiPitchFromNote('a1')).toBe(33);
        expect(midiPitchFromNote('b2')).toBe(47);
        expect(midiPitchFromNote('c3')).toBe(48);
        expect(midiPitchFromNote('c#3')).toBe(49);
        expect(midiPitchFromNote('d4')).toBe(62);
        expect(midiPitchFromNote('e5')).toBe(76);
        expect(midiPitchFromNote('f6')).toBe(89);
        expect(midiPitchFromNote('f#6')).toBe(90);
        expect(midiPitchFromNote('g7')).toBe(103);
        expect(midiPitchFromNote('g#7')).toBe(104);
    });

    it('handles flattened notes', () => {
        expect(midiPitchFromNote('bb1')).toBe(34);
        expect(midiPitchFromNote('eb4')).toBe(63);
    });

    it('handles unconventional notes', () => {
        expect(midiPitchFromNote('fb4')).toBe(64);
        expect(midiPitchFromNote('e#4')).toBe(65);
    });

    it('handles cross-octave notes', () => {
        expect(midiPitchFromNote('b#2')).toBe(48);
        expect(midiPitchFromNote('cb3')).toBe(47);
    });
});

describe('codes2Str', () => {
    it('converts byte array to string', () => {
        expect(codes2Str([65, 66, 67])).toBe('ABC');
    });
});

describe('str2Bytes', () => {
    it('converts hex string to byte array', () => {
        expect(str2Bytes('c')[0]).toBe(12);
    });
});

