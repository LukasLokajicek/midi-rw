import type {MidiChannelEvent, MidiMetaEvent} from '../src';

export function asChannel(e: unknown): MidiChannelEvent {
    const ev = e as MidiChannelEvent;
    if (ev.type !== 'channel') throw new Error(`Expected channel event, got ${ev.type}`);
    return ev;
}

export function asMeta(e: unknown): MidiMetaEvent {
    const ev = e as MidiMetaEvent;
    if (ev.type !== 'meta') throw new Error(`Expected meta event, got ${ev.type}`);
    return ev;
}
