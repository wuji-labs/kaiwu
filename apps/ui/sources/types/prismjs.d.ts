declare module 'prismjs' {
    namespace Prism {
        interface Grammar {
            [key: string]: unknown;
        }

        class Token {
            type: string;
            content: string | Token | Array<string | Token>;

            constructor(type: string, content: string | Token | Array<string | Token>, alias?: string | string[], matchedStr?: string);
        }

        const languages: Record<string, Grammar>;

        function tokenize(text: string, grammar: Grammar): Array<string | Token>;
    }

    export = Prism;
}
