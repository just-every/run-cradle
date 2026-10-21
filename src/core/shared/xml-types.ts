/** The XML DOM surface used server-side, independent of Workers' HTMLRewriter Element. */
export interface XmlElement {
 nodeType:number;namespaceURI:string|null;localName:string|null;textContent:string|null
 parentNode:XmlElement|null;childNodes:ArrayLike<XmlElement>;attributes:ArrayLike<{name:string;value:string}>
 getAttribute(name:string):string|null;getAttributeNS(namespace:string,name:string):string|null;hasAttribute(name:string):boolean
 getElementsByTagName(name:string):ArrayLike<XmlElement>;getElementsByTagNameNS(namespace:string,name:string):ArrayLike<XmlElement>
}
export interface XmlDocument {
 documentElement:XmlElement|null
 getElementsByTagName(name:string):ArrayLike<XmlElement>;getElementsByTagNameNS(namespace:string,name:string):ArrayLike<XmlElement>
}
