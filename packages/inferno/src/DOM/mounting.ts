/**
 * @module Inferno
 */ /** TypeDoc Comment */

import {
  isArray,
  isFunction,
  isInvalid,
  isNull,
  isNullOrUndef,
  isObject,
  isStringOrNumber,
  isUndefined,
  throwError
} from "inferno-shared";
import VNodeFlags from "inferno-vnode-flags";
import {
  isVNode, IV,
  options,
  VNode,
  createIV, IVTypes, IVFlags,
} from "../core/implementation";
import {
  componentToDOMNodeMap,
  documentCreateElement,
  EMPTY_OBJ, insertOrAppend,
  setTextContent
} from "./utils/common";
import {
  isControlledFormElement,
  processElement
} from "./wrappers/processElement";
import { patchProp } from "./props";
import {
  createClassComponentInstance
} from "./utils/components";

export function mount(
  iv: IV,
  input: VNode | string | number | Array<VNode|string|number|null|false|undefined|true>,
  parentDOM: Element,
  nextNode: Element | null,
  lifecycle: Function[],
  context: Object,
  isSVG: boolean,
  insertIntoDOM: boolean
) {
  if (isStringOrNumber(input)) {
    return mountText(iv, input, parentDOM, nextNode, lifecycle, context, isSVG, insertIntoDOM);
  }

  if (isVNode(input)) {
    return mountVNode(iv, input, parentDOM, nextNode, lifecycle, context, isSVG, insertIntoDOM);
  }

  // Development validation, in production we don't need to throw because it crashes anyway
  if (process.env.NODE_ENV !== "production") {
    // If input is not array then its invalid
    if (!isArray(input)) {
      if (typeof input === "object") {
        throwError(
          `mount() received an object that's not a valid VNode, you should stringify it first. Object: "${JSON.stringify(
            input
          )}".`
        );
      } else {
        throwError(
          `mount() expects a valid VNode, instead it received an object with the type "${typeof input}".`
        );
      }
    }
  }

  // Mount array
  mountArrayChildren(iv, input, parentDOM, nextNode, lifecycle, context, isSVG, false, true);

  return null;
}

export function mountVNode(
  iv: IV,
  input: VNode,
  parentDOM: Element,
  nextNode: Element | null,
  lifecycle: Function[],
  context: Object,
  isSVG: boolean,
  insertIntoDOM: boolean
) {
  const flags = input.flags;

  if ((flags & VNodeFlags.Element) > 0) {
    return mountElement(iv, input, parentDOM, nextNode, lifecycle, context, isSVG, insertIntoDOM);
  }

  if ((flags & VNodeFlags.Component) > 0) {
    return mountComponent(
      iv,
      input,
      parentDOM,
      nextNode,
      lifecycle,
      context,
      isSVG,
      insertIntoDOM
    );
  }

  if ((flags & VNodeFlags.Portal) > 0) {
    return mountPortal(iv, input, parentDOM, nextNode, lifecycle, context, false, insertIntoDOM);
  }
}

export function mountText(
  iv: IV,
  text: string | number,
  parentDOM: Element | null,
  nextNode: Element | null,
  lifecycle, context, isSVG,
  insertIntoDom: boolean
): any {
  const dom = document.createTextNode(text as string) as any;

  if (insertIntoDom) {
    iv.d = dom;
    insertOrAppend(parentDOM, dom, nextNode);
  }

  iv.f = IVFlags.HasTextChildren;

  return dom;
}


export function mountPortal(iv: IV, vNode: VNode, parentDOM: Element, nextNode: Element | null, lifecycle, context, isSVG: boolean, insertIntoDom: boolean) {
  const childIV = createIV(vNode.children as VNode, 0);

  iv.c = childIV;
  mount(childIV, vNode.children as VNode, vNode.type, null, lifecycle, context, isSVG, true);

  return mountText(iv, '', parentDOM, nextNode, lifecycle, context, isSVG, insertIntoDom);
}

export function mountElement(
  iv: IV,
  vNode: VNode,
  parentDOM: Element,
  nextNode: Element | null,
  lifecycle: Function[],
  context: Object,
  isSVG: boolean,
  insertIntoDom: boolean
) {
  const flags = vNode.flags;

  isSVG = isSVG || (flags & VNodeFlags.SvgElement) > 0;
  const dom = documentCreateElement(vNode.type, isSVG);
  const children = vNode.children;
  const props = vNode.props;
  const className = vNode.className;
  const ref = vNode.ref;

  if (isInvalid(children)) {
    iv.f = IVFlags.HasInvalidChildren;
  } else {
    if (isStringOrNumber(children)) {
      // Text
      setTextContent(dom, children as string | number);
      iv.f = IVFlags.HasTextChildren;
    } else {
      const childrenIsSVG = isSVG && vNode.type !== "foreignObject";

      if (isVNode(children)) {
        const childIV = createIV(children as VNode, 0);

        iv.c = childIV;
        iv.f = IVFlags.HasBasicChildren;

        mountVNode(childIV, children as VNode, dom, null, lifecycle, context, childrenIsSVG, true);
      } else {
        mountArrayChildren(iv, children, dom, null, lifecycle, context, childrenIsSVG, false, false);
      }
    }
  }

  if (!isNull(props)) {
    let hasControlledValue = false;
    const isFormElement = (flags & VNodeFlags.FormElement) > 0;
    if (isFormElement) {
      hasControlledValue = isControlledFormElement(props);
    }
    for (const prop in props) {
      // do not add a hasOwnProperty check here, it affects performance
      patchProp(prop, null, props[prop], dom, isSVG, hasControlledValue);
    }
    if (isFormElement) {
      processElement(flags, iv, dom, props, true, hasControlledValue);
    }
  }

  if (!isNull(className)) {
    if (isSVG) {
      dom.setAttribute("class", className);
    } else {
      dom.className = className;
    }
  }

  if (!isNull(ref)) {
    mountRef(dom, ref, lifecycle);
  }
  if (insertIntoDom) {
    iv.d = dom;
    insertOrAppend(parentDOM, dom, nextNode);
  }
  return dom;
}

export function mountArrayChildren(
  iv: IV,
  children: Array<VNode|string|number|null|false|undefined|true>,
  parentDOM: Element,
  nextNode: Element | null,
  lifecycle,
  context,
  isSVG: boolean,
  forceKeyed: boolean,
  isVirtual: boolean
) {
  let firstValid = true;
  let child;
  iv.c = null;
  iv.f = IVFlags.HasInvalidChildren; // default to invalid

  for (let i = 0, len = children.length; i < len; i++) {
    child = children[i];

    if (!isInvalid(child)) {
      if (firstValid) {
        iv.c = [];
        iv.f = forceKeyed || isVNode(child) && !isNullOrUndef((child).key) ? IVFlags.HasKeyedChildren : IVFlags.HasNonKeydChildren;
        firstValid = false;
      }
      const childIV = createIV(child, i);

      (iv.c as any[]).push(childIV);
      mount(childIV, child, parentDOM, nextNode, lifecycle, context, isSVG, true);
    }
  }

  if (isVirtual) {
    iv.t = IVTypes.IsVirtualArray;

    if ((iv.f & (IVFlags.HasKeyedChildren | IVFlags.HasNonKeydChildren)) > 0) {
      iv.d = (iv.c as IV[])[0].d;
    } else {
      iv.d = null;
    }
  } else {
    iv.t = IVTypes.Regular;
  }
}

export function mountComponent(
  iv: IV,
  vNode: VNode,
  parentDOM: Element,
  nextNode: Element | null,
  lifecycle,
  context,
  isSVG: boolean,
  insertIntoDom: boolean
) {
  const isClass = (vNode.flags & VNodeFlags.ComponentClass) > 0;
  let dom = null;
  const type = vNode.type as Function;
  const props = vNode.props || EMPTY_OBJ;
  const ref = vNode.ref;
  let renderOutput;
  let instance;
  let childIV;

  if (isClass) {
    instance = createClassComponentInstance(
      iv,
      type,
      props,
      context,
      lifecycle,
      parentDOM
    );
    renderOutput = instance.render(props, instance.state, context);
    context = instance.$CX;
    if (isFunction(options.afterRender)) {
      options.afterRender(instance);
    }
  } else {
    renderOutput = type(props, context);
  }

  if (isInvalid(renderOutput)) {
    iv.f = IVFlags.HasInvalidChildren;
  } else {
    iv.f = IVFlags.HasBasicChildren;
    iv.c = childIV = createIV(renderOutput, 0);
    childIV.b = iv;
    childIV.d = dom = mount(
      childIV,
      renderOutput,
      parentDOM,
      nextNode,
      lifecycle,
      context,
      isSVG,
      false
    );
  }

  if (isClass) {
    mountClassComponentCallbacks(vNode, ref, instance, lifecycle);
    instance.$UPD = false;
    if (options.findDOMNodeEnabled) {
      componentToDOMNodeMap.set(instance, dom);
    }
  } else {
    mountFunctionalComponentCallbacks(props, ref, dom, lifecycle);
  }

  if (insertIntoDom && !isNull(dom)) {
    iv.d = dom;
    insertOrAppend(parentDOM, dom, nextNode);
  }

  return dom;
}

export function mountClassComponentCallbacks(
  vNode: VNode,
  ref,
  instance,
  lifecycle: Function[]
) {
  if (ref) {
    if (isFunction(ref)) {
      ref(instance);
    } else {
      if (process.env.NODE_ENV !== "production") {
        if (isStringOrNumber(ref)) {
          throwError(
            'string "refs" are not supported in Inferno 1.0. Use callback "refs" instead.'
          );
        } else if (isObject(ref)) {
          throwError(
            "functional component lifecycle events are not supported on ES2015 class components."
          );
        } else {
          throwError(
            `a bad value for "ref" was used on component: "${JSON.stringify(
              ref
            )}"`
          );
        }
      }
      throwError();
    }
  }
  const hasDidMount = !isUndefined(instance.componentDidMount);
  const afterMount = options.afterMount;

  if (hasDidMount || !isNull(afterMount)) {
    lifecycle.push(() => {
      instance.$UPD = true;
      if (afterMount) {
        afterMount(vNode);
      }
      if (hasDidMount) {
        instance.componentDidMount();
      }
      instance.$UPD = false;
    });
  }
}

export function mountFunctionalComponentCallbacks(
  props,
  ref,
  dom,
  lifecycle: Function[]
) {
  if (ref) {
    if (!isNullOrUndef(ref.onComponentWillMount)) {
      ref.onComponentWillMount(props);
    }
    if (!isNullOrUndef(ref.onComponentDidMount)) {
      lifecycle.push(() => ref.onComponentDidMount(dom, props));
    }
  }
}

export function mountRef(dom: Element, value, lifecycle: Function[]) {
  if (isFunction(value)) {
    lifecycle.push(() => value(dom));
  } else {
    if (isInvalid(value)) {
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      throwError(
        'string "refs" are not supported in Inferno 1.0. Use callback "refs" instead.'
      );
    }
    throwError();
  }
}
