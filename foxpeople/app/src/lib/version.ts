import pkg from "../../package.json";
/** Programmversion – kommt aus package.json, damit die Anzeige nie wieder veraltet. */
export const VERSION: string = (pkg as { version: string }).version;
