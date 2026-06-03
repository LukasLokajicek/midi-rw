export interface ParseError {
    offset: number;
    message: string;
}

export interface MidiHeader {
    format: 0 | 1 | 2;
    numTracks: number;
    ticksPerBeat?: number;
    framesPerSecond?: number;
    ticksPerFrame?: number;
}

export interface MidiChannelEvent {
    type: 'channel';
    subtype: 'noteOff' | 'noteOn' | 'noteAftertouch' | 'controller' |
             'programChange' | 'channelAftertouch' | 'pitchBend';
    deltaTime: number;
    channel: number;
    param1: number;
    param2?: number;
    // Semantic aliases — populated based on subtype
    noteNumber?: number;  // noteOn, noteOff, noteAftertouch
    velocity?: number;    // noteOn, noteOff
    controller?: number;  // controller
    value?: number;       // controller value, pitchBend, noteAftertouch amount, channelAftertouch amount
    program?: number;     // programChange
    pressure?: number;    // channelAftertouch
}

export interface MidiMetaEvent {
    type: 'meta';
    subtype: 'sequenceNumber' | 'text' | 'copyright' | 'trackName' | 'instrument' |
             'lyric' | 'marker' | 'cuePoint' | 'channelPrefix' | 'endOfTrack' |
             'tempo' | 'smpteOffset' | 'timeSignature' | 'keySignature' |
             'sequencerSpecific' | 'unknown';
    deltaTime: number;
    metaType: number;
    data?: number[];
    // Decoded fields for common subtypes
    bpm?: number;
    numerator?: number;
    denominator?: number;
    accidentals?: number;
    minor?: boolean;
    text?: string;
}

export type MidiEvent = MidiChannelEvent | MidiMetaEvent;

export interface MidiTrack {
    events: MidiEvent[];
}

export interface MidiData {
    header: MidiHeader;
    tracks: MidiTrack[];
    errors: ParseError[];
}
