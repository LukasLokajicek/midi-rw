import {translateTickTime} from './Util';

export interface MidiEventParams {
    readonly type: number;
    readonly channel: number;
    readonly param1: number;
    readonly param2?: number;
    readonly time?: number;
}

export class MidiEvent {
    static readonly NOTE_OFF = 0x80;
    static readonly NOTE_ON = 0x90;
    static readonly AFTER_TOUCH = 0xA0;
    static readonly CONTROLLER = 0xB0;
    static readonly PROGRAM_CHANGE = 0xC0;
    static readonly CHANNEL_AFTERTOUCH = 0xD0;
    static readonly PITCH_BEND = 0xE0;

    readonly time: readonly number[];
    readonly type: number;
    readonly channel: number;
    readonly param1: number;
    readonly param2: number | undefined;

    constructor(params: MidiEventParams) {
        if (params.type < MidiEvent.NOTE_OFF || params.type > MidiEvent.PITCH_BEND) {
            throw new Error('Trying to set an unknown event: ' + params.type);
        }
        if (params.channel < 0 || params.channel > 15) {
            throw new Error('Channel is out of bounds.');
        }

        this.time = translateTickTime(params.time ?? 0);
        this.type = params.type;
        this.channel = params.channel;
        this.param1 = params.param1;
        this.param2 = params.param2;
    }

    toBytes(): number[] {
        const byteArray: number[] = [];
        const typeChannelByte = this.type | (this.channel & 0xF);

        byteArray.push(...this.time);
        byteArray.push(typeChannelByte);
        byteArray.push(this.param1);

        if (this.param2 !== undefined) {
            byteArray.push(this.param2);
        }
        return byteArray;
    }
}
