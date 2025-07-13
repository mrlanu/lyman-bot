import {Context, SessionFlavor} from 'grammy';

export interface SessionData {}

export type MyContext = Context & SessionFlavor<SessionData>;
