import {DEFAULT_VOLUME} from './constants';
import {MetaEvent} from './MetaEvent';
import {MidiEvent} from './MidiEvent';
import {ensureMidiPitch, mpqnFromBpm, str2Bytes} from './Util';

export class Track {
    static readonly START_BYTES = [0x4d, 0x54, 0x72, 0x6b] as const;
    static readonly END_BYTES = [0x00, 0xFF, 0x2F, 0x00] as const;

    private readonly _events: (MidiEvent | MetaEvent)[] = [];

    get events(): readonly (MidiEvent | MetaEvent)[] {
        return this._events;
    }

    addEvent(event: MidiEvent | MetaEvent): this {
        this._events.push(event);
        return this;
    }

    addNoteOn(channel: number, pitch: string | number, time?: number, velocity?: number): this {
        this._events.push(new MidiEvent({
            type: MidiEvent.NOTE_ON,
            channel,
            param1: ensureMidiPitch(pitch),
            param2: velocity ?? DEFAULT_VOLUME,
            time: time ?? 0,
        }));
        return this;
    }

    addNoteOff(channel: number, pitch: string | number, time?: number, velocity?: number): this {
        this._events.push(new MidiEvent({
            type: MidiEvent.NOTE_OFF,
            channel,
            param1: ensureMidiPitch(pitch),
            param2: velocity ?? DEFAULT_VOLUME,
            time: time ?? 0,
        }));
        return this;
    }

    addNote(channel: number, pitch: string | number, dur?: number, time?: number, velocity?: number): this {
        this.addNoteOn(channel, pitch, time, velocity);
        if (dur) {
            this.addNoteOff(channel, pitch, dur, velocity);
        }
        return this;
    }

    addChord(channel: number, chord: (string | number)[], dur: number, velocity?: number): this {
        if (!Array.isArray(chord) || !chord.length) {
            throw new Error('Chord must be an array of pitches');
        }
        chord.forEach(note => {
            this.addNoteOn(channel, note, 0, velocity);
        });
        chord.forEach((note, index) => {
            if (index === 0) {
                this.addNoteOff(channel, note, dur);
            } else {
                this.addNoteOff(channel, note);
            }
        });
        return this;
    }

    setInstrument(channel: number, instrument: number, time?: number): this {
        this._events.push(new MidiEvent({
            type: MidiEvent.PROGRAM_CHANGE,
            channel,
            param1: instrument,
            time: time ?? 0,
        }));
        return this;
    }

    setTempo(bpm: number, time?: number): this {
        this._events.push(new MetaEvent({
            type: MetaEvent.TEMPO,
            data: mpqnFromBpm(bpm),
            time: time ?? 0,
        }));
        return this;
    }

    setTimeSignature(numerator: number, denominator: number, time?: number): this {
        const ddlog2 = Math.log2(denominator);
        if (ddlog2 !== Math.floor(ddlog2)) {
            throw new Error('Time signature denominator must be an exact power of 2!');
        }
        this._events.push(new MetaEvent({
            type: MetaEvent.TIME_SIG,
            data: [numerator & 0xFF, Math.floor(ddlog2) & 0xFF, 0x18, 0x08],
            time: time ?? 0,
        }));
        return this;
    }

    setKeySignature(accidentals: number, minor?: boolean, time?: number): this {
        this._events.push(new MetaEvent({
            type: MetaEvent.KEY_SIG,
            data: [accidentals & 0xFF, minor ? 1 : 0],
            time: time ?? 0,
        }));
        return this;
    }

    toBytes(): number[] {
        let trackLength = 0;
        const eventBytes: number[] = [];

        this._events.forEach(event => {
            const bytes = event.toBytes();
            trackLength += bytes.length;
            eventBytes.push(...bytes);
        });

        trackLength += Track.END_BYTES.length;

        const lengthBytes = str2Bytes(trackLength.toString(16), 4);

        return [...Track.START_BYTES, ...lengthBytes, ...eventBytes, ...Track.END_BYTES];
    }
}
