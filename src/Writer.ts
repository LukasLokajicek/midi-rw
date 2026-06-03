import {MidiData, MidiChannelEvent, MidiMetaEvent} from './MidiData';
import {translateTickTime, mpqnFromBpm} from './Util';

// ---------------------------------------------------------------------------
// Byte-writing helpers
// ---------------------------------------------------------------------------

function writeUint16BE(value: number): number[] {
    return [(value >> 8) & 0xFF, value & 0xFF];
}

function writeUint32BE(value: number): number[] {
    return [
        (value >> 24) & 0xFF,
        (value >> 16) & 0xFF,
        (value >> 8) & 0xFF,
        value & 0xFF,
    ];
}

function writeStr(s: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
}

function writeVarLen(value: number): number[] {
    return translateTickTime(value);
}

// ---------------------------------------------------------------------------
// Channel event serializer
// ---------------------------------------------------------------------------

const CHANNEL_TYPE_NIBBLE: Record<MidiChannelEvent['subtype'], number> = {
    noteOff:           0x8,
    noteOn:            0x9,
    noteAftertouch:    0xA,
    controller:        0xB,
    programChange:     0xC,
    channelAftertouch: 0xD,
    pitchBend:         0xE,
};

const ONE_PARAM_SUBTYPES = new Set<MidiChannelEvent['subtype']>(['programChange', 'channelAftertouch']);

function serializeChannelEvent(event: MidiChannelEvent): number[] {
    const typeNibble = CHANNEL_TYPE_NIBBLE[event.subtype];
    const status = ((typeNibble << 4) | (event.channel & 0xF)) & 0xFF;
    const bytes = [status, event.param1];
    if (!ONE_PARAM_SUBTYPES.has(event.subtype)) {
        bytes.push(event.param2 ?? 0);
    }
    return bytes;
}

// ---------------------------------------------------------------------------
// Meta event serializer
// ---------------------------------------------------------------------------

const TEXT_META_TYPES: Record<string, number> = {
    text: 0x01, copyright: 0x02, trackName: 0x03, instrument: 0x04,
    lyric: 0x05, marker: 0x06, cuePoint: 0x07,
};

function serializeMetaEvent(event: MidiMetaEvent): number[] {
    const bytes: number[] = [0xFF, event.metaType];

    if (event.subtype === 'endOfTrack') {
        bytes.push(0x00);
        return bytes;
    }

    if (event.subtype === 'tempo' && event.bpm !== undefined) {
        const mpqn = mpqnFromBpm(event.bpm);
        bytes.push(...writeVarLen(mpqn.length), ...mpqn);
        return bytes;
    }

    if (event.subtype === 'timeSignature' &&
        event.numerator !== undefined && event.denominator !== undefined) {
        const denomLog2 = Math.round(Math.log2(event.denominator));
        const data = event.data ?? [];
        const clocks = data[2] ?? 24;
        const thirtySeconds = data[3] ?? 8;
        bytes.push(...writeVarLen(4), event.numerator, denomLog2, clocks, thirtySeconds);
        return bytes;
    }

    if (event.subtype === 'keySignature' &&
        event.accidentals !== undefined && event.minor !== undefined) {
        const key = event.accidentals < 0 ? event.accidentals + 256 : event.accidentals;
        bytes.push(...writeVarLen(2), key & 0xFF, event.minor ? 1 : 0);
        return bytes;
    }

    if (TEXT_META_TYPES[event.subtype] !== undefined && event.text !== undefined) {
        const textBytes = writeStr(event.text);
        bytes.push(...writeVarLen(textBytes.length), ...textBytes);
        return bytes;
    }

    if (event.subtype === 'sequenceNumber') {
        const data = event.data ?? [0, 0];
        bytes.push(...writeVarLen(data.length), ...data);
        return bytes;
    }

    if (event.subtype === 'channelPrefix') {
        const data = event.data ?? [0];
        bytes.push(...writeVarLen(data.length), ...data);
        return bytes;
    }

    if (event.subtype === 'smpteOffset') {
        const data = event.data ?? [0, 0, 0, 0, 0];
        bytes.push(...writeVarLen(data.length), ...data);
        return bytes;
    }

    // Fallback: re-emit raw data (unknown or sequencerSpecific)
    const data = event.data ?? [];
    bytes.push(...writeVarLen(data.length), ...data);
    return bytes;
}

// ---------------------------------------------------------------------------
// Track serializer
// ---------------------------------------------------------------------------

function serializeTrack(events: Array<MidiChannelEvent | MidiMetaEvent>): number[] {
    const trackBytes: number[] = [];
    let hasEndOfTrack = false;

    for (const event of events) {
        trackBytes.push(...writeVarLen(event.deltaTime));
        if (event.type === 'channel') {
            trackBytes.push(...serializeChannelEvent(event));
        } else {
            if (event.subtype === 'endOfTrack') hasEndOfTrack = true;
            trackBytes.push(...serializeMetaEvent(event));
        }
    }

    if (!hasEndOfTrack) {
        trackBytes.push(0x00, 0xFF, 0x2F, 0x00);
    }

    return [
        ...writeStr('MTrk'),
        ...writeUint32BE(trackBytes.length),
        ...trackBytes,
    ];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function writeMidi(data: MidiData): Uint8Array {
    const {header, tracks} = data;

    const ticksPerBeat = header.ticksPerBeat ?? 128;
    const headerBytes: number[] = [
        ...writeStr('MThd'),
        ...writeUint32BE(6),
        ...writeUint16BE(header.format),
        ...writeUint16BE(tracks.length),
        ...writeUint16BE(ticksPerBeat),
    ];

    const allBytes: number[] = [...headerBytes];
    for (const track of tracks) {
        allBytes.push(...serializeTrack(track.events));
    }

    return new Uint8Array(allBytes);
}
