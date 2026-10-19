/** Explicit structural boundary for reusing the unchanged production readers. */
declare module '*book-shell.mjs' {
  export function bookShell(item:{title:string},t:(zh:string,en:string)=>string):string;
}
declare module '*book-reader.mjs' {
  export function mountBookReader(root:HTMLElement,item:{id:string;recordId?:string;title:string;summary?:string;category?:string;coverSrc?:string;downloadUrl?:string;file?:string;externalUrl?:string;book:{revision:string;chapters:Array<{id:string;title:string;parts:number;headings?:Array<{title:string;level:number;block:string;offset:number;part?:number}>}>}},options?:{english?:boolean}):()=>void;
}
declare module '*book-image-viewer.mjs' {
  export function createBookImageViewer(root:HTMLElement,options?:{english?:boolean;className?:string}):{readonly active:boolean;open(image:HTMLImageElement):void;destroy():void};
}
declare module '*vip-book-prompt.mjs' {
  export const vipContactURL: string;
}
