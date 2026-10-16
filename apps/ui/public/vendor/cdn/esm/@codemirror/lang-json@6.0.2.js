/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@codemirror/lang-json@6.0.2/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{parser as a}from"https://kaiwu.wujilabs.cn/vendor/cdn/esm/@lezer/json@1.0.3.js";import{LRLanguage as s,indentNodeProp as i,continuedIndent as r,foldNodeProp as c,foldInside as d,LanguageSupport as g}from"https://kaiwu.wujilabs.cn/vendor/cdn/esm/@codemirror/language@6.11.1.js";const m=()=>n=>{try{JSON.parse(n.state.doc.toString())}catch(e){if(!(e instanceof SyntaxError))throw e;const t=p(e,n.state.doc);return[{from:t,message:e.message,severity:"error",to:t}]}return[]};function p(n,e){let t;return(t=n.message.match(/at position (\d+)/))?Math.min(+t[1],e.length):(t=n.message.match(/at line (\d+) column (\d+)/))?Math.min(e.line(+t[1]).from+ +t[2]-1,e.length):0}const o=s.define({name:"json",parser:a.configure({props:[i.add({Object:r({except:/^\s*\}/}),Array:r({except:/^\s*\]/})}),c.add({"Object Array":d})]}),languageData:{closeBrackets:{brackets:["[","{",'"']},indentOnInput:/^\s*[\}\]]$/}});function u(){return new g(o)}export{u as json,o as jsonLanguage,m as jsonParseLinter};
//# sourceMappingURL=/sm/2da7098008d8ba45528aab0cb2d86885f8f239aec87784e83520a9f49d9c21d2.map