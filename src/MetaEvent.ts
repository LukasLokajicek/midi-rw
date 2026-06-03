import {translateTickTime} from './Util';

export interface MetaEventParams {
    readonly type: number;
    readonly data?: readonly number[] | number | string;
    readonly time?: number;
}

export class MetaEvent {
    static readonly SEQUENCE = 0x00;
    static readonly TEXT = 0x01;
    static readonly COPYRIGHT = 0x02;
    static readonly TRACK_NAME = 0x03;
    static readonly INSTRUMENT = 0x04;
    static readonly LYRIC = 0x05;
    static readonly MARKER = 0x06;
    static readonly CUE_POINT = 0x07;
    static readonly CHANNEL_PREFIX = 0x20;
    static readonly END_OF_TRACK = 0x2f;
    static readonly TEMPO = 0x51;
    static readonly SMPTE = 0x54;
    static readonly TIME_SIG = 0x58;
    static readonly KEY_SIG = 0x59;
    static readonly SEQ_EVENT = 0x7f;

    readonly time: readonly number[];
    readonly type: number;
    readonly data: readonly number[] | number | string | undefined;

    constructor(params: MetaEventParams) {
        this.time = translateTickTime(params.time ?? 0);
        this.type = params.type;
        this.data = params.data;
    }

    toBytes(): number[] {
        const byteArray: number[] = [];
        byteArray.push(...this.time);
        byteArray.push(0xFF, this.type);

        if (Array.isArray(this.data)) {
            byteArray.push(this.data.length);
            byteArray.push(...this.data);
        } else if (typeof this.data === 'number') {
            byteArray.push(1, this.data);
        } else if (typeof this.data === 'string') {
            byteArray.push(this.data.length);
            const dataBytes = this.data.split('').map(x => x.charCodeAt(0));
            byteArray.push(...dataBytes);
        } else {
            byteArray.push(0);
        }

        return byteArray;
    }
}
