/**
 * @module Inferno-Hyperscript
 */ /** TypeDoc Comment */

import { isArray, isString, isStringOrNumber, isUndefined } from 'inferno-shared';
import {IVNode, InfernoChildren, getFlagsForElementVnode, createVNode} from 'inferno';
import VNodeFlags from 'inferno-vnode-flags';

const classIdSplit = /([.#]?[a-zA-Z0-9_:-]+)/;
const notClassId = /^\.|#/;

function parseTag(tag: string | null, props: any): string {
	if (!tag) {
		return 'div';
	}
	const noId = props && isUndefined(props.id);
	const tagParts = tag.split(classIdSplit);
	let tagName: null | string = null;

	if (notClassId.test(tagParts[ 1 ])) {
		tagName = 'div';
	}
	let classes;

	for (let i = 0, len = tagParts.length; i < len; i++) {
		const part = tagParts[ i ];

		if (!part) {
			continue;
		}
		const type = part.charAt(0);

		if (!tagName) {
			tagName = part;
		} else if (type === '.') {
			if (classes === void 0) {
				classes = [];
			}
			classes.push(part.substring(1, part.length));
		} else if (type === '#' && noId) {
			props.id = part.substring(1, part.length);
		}
	}
	if (classes) {
		if (props.className) {
			classes.push(props.className);
		}
		props.className = classes.join(' ');
	}
	return tagName || 'div';
}

function isChildren(x: any): boolean {
	return isStringOrNumber(x) || (x && isArray(x));
}

function extractProps(_props: any, isElement: boolean, _tag: string | IVNode): any {
	_props = _props || {};
	const tag = isElement ? parseTag(_tag as string, _props) : _tag;
	const newProps = {};
	let key = null;
	let ref: any = null;
	let children = null;
	let className = null;

	for (const prop in _props) {
		if (isElement && (prop === 'className' || prop === 'class')) {
			className = _props[ prop ];
		} else if (prop === 'key') {
			key = _props[ prop ];
		} else if (prop === 'ref') {
			ref = _props[ prop ];
		} else if (prop === 'hooks') {
			ref = _props[ prop ];
		} else if (prop === 'children') {
			children = _props[ prop ];
		} else if (!isElement && prop.substr(0, 11) === 'onComponent') {
			if (!ref) {
				ref = {};
			}
			ref[ prop ] = _props[ prop ];
		} else {
			newProps[ prop ] = _props[ prop ];
		}
	}
	return { tag, props: newProps, key, ref, children, className };
}

/**
 * Creates virtual node
 * @param {string|IVNode|Function} _tag Name for virtual node
 * @param {object=} _props Additional properties for virtual node
 * @param {string|number|IVNode|Array<string|number|VNode>|null=} _children Optional children for virtual node
 * @returns {IVNode} returns new virtual node
 */
export default function hyperscript(_tag: string | IVNode | Function, _props?: any, _children?: InfernoChildren): IVNode {
	// If a child array or text node are passed as the second argument, shift them
	if (!_children && isChildren(_props)) {
		_children = _props;
		_props = {};
	}
	const isElement = isString(_tag);
	const { tag, props, key, ref, children, className } = extractProps(_props, isElement, _tag as IVNode);

	if (isElement) {
		return createVNode(getFlagsForElementVnode(tag), tag, className, _children || children, props, key, ref);
	} else {
		if (children || _children) {
			(props as any).children = children || _children;
		}
		return createVNode(VNodeFlags.ComponentUnknown, tag, className, null, props, key, ref);
	}
}
