/**
 * @module Inferno-Component
 */ /** TypeDoc Comment */

// Make sure u use EMPTY_OBJ from 'inferno', otherwise it'll be a different reference
import {
  EMPTY_OBJ,
  IFiber,
  Fiber,
  mount,
  internal_DOMNodeMap,
  internal_patch,
  options,
  Props,
  IVNode
} from "inferno";
import {
  combineFrom,
  ERROR_MSG,
  isBrowser,
  isFunction,
  isNullOrUndef,
  LifecycleClass,
  NO_OP,
  throwError,
  isInvalid
} from "inferno-shared";

const C = options.component;

/* Add ES6 component implementations for Inferno-core to use */
C.create = createInstance;
C.patch = patchComponent;
C.flush = flushQueue;

const G = (window || global) as any;
const handleInput = C.handleInput as Function;
let noOp = ERROR_MSG;

if (process.env.NODE_ENV !== "production") {
  noOp =
    "Inferno Error: Can only update a mounted or mounting component. This usually means you called setState() or forceUpdate() on an unmounted component. This is a no-op.";
}

export interface ComponentLifecycle<P, S> {
  componentDidMount?(): void;
  componentWillMount?(): void;
  componentWillReceiveProps?(nextProps: P, nextContext: any): void;
  shouldComponentUpdate?(nextProps: P, nextState: S, nextContext: any): boolean;
  componentWillUpdate?(nextProps: P, nextState: S, nextContext: any): void;
  componentDidUpdate?(prevProps: P, prevState: S, prevContext: any): void;
  componentWillUnmount?(): void;
}

function queueStateChanges<P, S>(
  component: Component<P, S>,
  newState: S,
  callback?: Function
): void {
  if (isFunction(newState)) {
    newState = (newState as any)(
      component.state,
      component.props,
      component.context
    ) as S;
  }
  let pending = component._pendingState;

  if (isNullOrUndef(pending)) {
    component._pendingState = pending = newState;
  } else {
    for (const stateKey in newState as S) {
      pending[stateKey] = newState[stateKey];
    }
  }

  if (isBrowser && !component._pendingSetState && !component._blockRender) {
    queueStateChange(component, false, callback);
  } else {
    const state = component.state;

    if (state === null) {
      component.state = pending;
    } else {
      for (const key in pending) {
        state[key] = pending[key];
      }
    }

    component._pendingState = null;
    if (component._blockRender && isFunction(callback)) {
      component._lifecycle.addListener(callback.bind(component));
    }
  }
}

function createInstance(
  parentFiber: IFiber,
  vNode: IVNode,
  Component,
  props: Props,
  context: Object,
  isSVG: boolean,
  lifecycle: LifecycleClass
) {
  const instance = new Component(props, context) as Component<any, any>;
  // vNode.children = instance as any;
  parentFiber.c = instance;
  instance._blockSetState = false;
  instance.context = context;
  if (instance.props === EMPTY_OBJ) {
    instance.props = props;
  }
  // setState callbacks must fire after render is done when called from componentWillReceiveProps or componentWillMount
  instance._lifecycle = lifecycle;
  instance._pendingSetState = true;
  instance._isSVG = isSVG;
  if (isFunction(instance.componentWillMount)) {
    instance._blockRender = true;
    instance.componentWillMount();
    instance._blockRender = false;
  }

  let childContext;
  if (isFunction(instance.getChildContext)) {
    childContext = instance.getChildContext();
  }

  if (isNullOrUndef(childContext)) {
    instance._childContext = context;
  } else {
    instance._childContext = combineFrom(context, childContext);
  }

  if (isFunction(options.beforeRender)) {
    options.beforeRender(instance);
  }

  const renderOutput = instance.render(props, instance.state, context);

  if (isFunction(options.afterRender)) {
    options.afterRender(instance);
  }

  instance._pendingSetState = false;
  instance._fiber = parentFiber;
  parentFiber.children = new Fiber(handleInput(renderOutput), "0");
  return instance;
}

function updateComponent<P, S>(
  component: Component<P, S>,
  prevState: S,
  nextState: S,
  prevProps: P & Props,
  nextProps: P & Props,
  context: any,
  force: boolean,
  fromSetState: boolean
): IVNode | string {
  if (component._unmounted === true) {
    if (process.env.NODE_ENV !== "production") {
      throwError(noOp);
    }
    throwError();
  }
  if (
    prevProps !== nextProps ||
    nextProps === EMPTY_OBJ ||
    prevState !== nextState ||
    force
  ) {
    if (prevProps !== nextProps || nextProps === EMPTY_OBJ) {
      if (!fromSetState && isFunction(component.componentWillReceiveProps)) {
        // keep a copy of state before componentWillReceiveProps
        const beforeState = combineFrom(component.state) as any;
        component._blockRender = true;
        component.componentWillReceiveProps(nextProps, context);
        component._blockRender = false;
        const afterState = component.state;
        if (beforeState !== afterState) {
          // if state changed in componentWillReceiveProps, reassign the beforeState
          component.state = beforeState;
          // set the afterState as pending state so the change gets picked up below
          component._pendingSetState = true;
          component._pendingState = afterState;
        }
      }
      if (component._pendingSetState) {
        nextState = combineFrom(nextState, component._pendingState) as any;
        component._pendingSetState = false;
        component._pendingState = null;
      }
    }

    /* Update if scu is not defined, or it returns truthy value or force */
    // When force is true we should not call scu
    const hasSCU = isFunction(component.shouldComponentUpdate);
    if (
      force ||
      !hasSCU ||
      (hasSCU &&
        (component.shouldComponentUpdate as Function)(
          nextProps,
          nextState,
          context
        ) !== false)
    ) {
      if (isFunction(component.componentWillUpdate)) {
        component._blockSetState = true;
        component.componentWillUpdate(nextProps, nextState, context);
        component._blockSetState = false;
      }

      component.props = nextProps;
      component.state = nextState;
      component.context = context;

      if (isFunction(options.beforeRender)) {
        options.beforeRender(component);
      }
      const render = component.render(nextProps, nextState, context);

      if (isFunction(options.afterRender)) {
        options.afterRender(component);
      }

      return render;
    } else {
      component.props = nextProps;
      component.state = nextState;
      component.context = context;
    }
  }
  return NO_OP;
}

function patchComponent(
  fiber: IFiber,
  nextVNode: IVNode,
  parentDom,
  lifecycle: LifecycleClass,
  context,
  isSVG: boolean,
  isRecycling: boolean
) {
  const instance = fiber.c;
  instance._fiber = fiber;
  instance._updating = true;

  if (instance._unmounted) {
    return true;
  } else {
    fiber.dom = handleUpdate(
      instance,
      instance.state,
      nextVNode.props || EMPTY_OBJ,
      context,
      false,
      false,
      isRecycling,
      isSVG,
      lifecycle,
      parentDom
    );
    // nextVNode.children = instance;
  }
  instance._updating = false;

  return false;
}

// const resolvedPromise = Promise.resolve();
let componentFlushQueue: Array<Component<any, any>> = [];

// // when a components root IVNode is also a component, we can run into issues
// // this will recursively look for input.parentNode if the IVNode is a component
// function updateParentComponentVNodes(vNode: IVNode, dom: Element) {
// 	if (vNode.flags & VNodeFlags.Component) {
// 		const parentVNode = vNode.parentVNode;
//
// 		if (parentVNode) {
// 			parentVNode.dom = dom;
// 			updateParentComponentVNodes(parentVNode, dom);
// 		}
// 	}
// }

function handleUpdate(
  component: Component<any, any>,
  nextState,
  nextProps,
  context,
  force: boolean,
  fromSetState: boolean,
  isRecycling: boolean,
  isSVG: boolean,
  lifeCycle,
  parentDom
) {
  // let nextInput;
  const hasComponentDidUpdateIsFunction = isFunction(
    component.componentDidUpdate
  );
  // When component has componentDidUpdate hook, we need to clone lastState or will be modified by reference during update
  const prevState = hasComponentDidUpdateIsFunction
    ? combineFrom(nextState, null)
    : component.state;
  // const lastInput = component._lastInput as IVNode;
  const prevProps = component.props;
  const renderOutput = updateComponent(
    component,
    prevState,
    nextState,
    prevProps,
    nextProps,
    context,
    force,
    fromSetState
  );
  // const vNode = component._vNode;
  const componentRootFiber = component._fiber.children as IFiber;

  if (renderOutput !== NO_OP) {
    const nextInput = handleInput(renderOutput);
    let childContext;

    if (isFunction(component.getChildContext)) {
      childContext = component.getChildContext();
    }

    if (isNullOrUndef(childContext)) {
      childContext = component._childContext;
    } else {
      childContext = combineFrom(context, childContext as any);
    }

    // if (nextInput.flags & VNodeFlags.Component) {
    // 	nextInput.parentVNode = vNode;
    // } else if (lastInput.flags & VNodeFlags.Component) {
    // 	lastInput.parentVNode = vNode;
    // }

    // lastVNode: nextVNode: parentDom, lifecycle, context, isSVG, isRecycling

    if (!isInvalid(nextInput)) {
      if (isInvalid(componentRootFiber.input)) {
        // fiber, input, parentDom, lifecycle, context, isSVG
        mount(
          componentRootFiber,
          nextInput as IVNode,
          parentDom as Element,
          lifeCycle,
          childContext,
          isSVG
        );
      } else {
        internal_patch(
          componentRootFiber,
          nextInput as IVNode,
          parentDom as Element,
          lifeCycle,
          childContext,
          isSVG,
          isRecycling
        );
      }
    }
    componentRootFiber.input = nextInput;

    if (fromSetState) {
      lifeCycle.trigger();
    }

    if (hasComponentDidUpdateIsFunction) {
      (component.componentDidUpdate as Function)(prevProps, prevState, context);
    }
    if (isFunction(options.afterUpdate)) {
      // options.afterUpdate(vNode);
    }
    if (options.findDOMNodeEnabled) {
      // internal_DOMNodeMap.set(component, nextInput.dom);
    }
  } else {
    // nextInput = lastInput;
  }

  // componentRootFiber.input = nextInput;
  // if (nextInput.flags & VNodeFlags.Component) {
  // 	nextInput.parentVNode = vNode;
  // } else if (lastInput.flags & VNodeFlags.Component) {
  // 	lastInput.parentVNode = vNode;
  // }

  // component._lastInput = nextInput as IVNode;
  // const dom = vNode.dom = (nextInput as IVNode).dom as Element;
  const dom = component._fiber.dom;

  if (options.findDOMNodeEnabled) {
    internal_DOMNodeMap.set(component, dom);
  }

  return dom;
}

function applyState<P, S>(component: Component<P, S>, force: boolean): void {
  if (component._unmounted) {
    return;
  }
  if (force || !component._blockRender) {
    const pendingState = component._pendingState;
    component._pendingSetState = false;
    component._pendingState = null;
    const fiber = component._fiber;

    handleUpdate(
      component,
      combineFrom(component.state, pendingState),
      component.props,
      component.context,
      force,
      true,
      false,
      component._isSVG,
      component._lifecycle,
      fiber.dom
    );
  } else {
    component.state = component._pendingState as S;
    component._pendingState = null;
  }
}

// let globalFlushPending = false;

function flushQueue() {
  const length = componentFlushQueue.length;

  if (length > 0) {
    for (let i = 0; i < length; i++) {
      const component = componentFlushQueue[i];

      applyState(component, false);

      const callbacks = component.__FCB;

      if (callbacks !== null) {
        for (let j = 0, len = callbacks.length; j < len; j++) {
          callbacks[i].call(component);
        }
        component.__FCB = null;
      }
      component.__FP = false; // Flush no longer pending for this component
    }
    componentFlushQueue = [];
  }
}

function queueStateChange(component, force, callback) {
  if (G.INFRender) {
    // When more setStates stack up, we queue them
    if (!component.__FP) {
      component.__FP = true;
      componentFlushQueue.push(component);
    }

    if (isFunction(callback)) {
      const callbacks = component.__FCB;

      if (callbacks === null) {
        component.__FCB = [callback];
      } else {
        callbacks.push(callback);
      }
    }
  } else {
    // Main setState loop
    G.INFRender = true;
    applyState(component, force);
    flushQueue();
    G.INFRender = false;

    if (isFunction(callback)) {
      callback.call(component);
    }
  }
}

export default class Component<P, S> implements ComponentLifecycle<P, S> {
  public static defaultProps: {};
  public state: S | null = null;
  public props: P & Props;
  public context: any;
  public _blockRender = false;
  public _blockSetState = true;
  public _pendingSetState = false;
  public _pendingState: S | null = null;
  // public _lastInput: any = null;
  public _fiber: IFiber;
  public _unmounted: boolean = false;
  public _lifecycle: LifecycleClass;
  public _childContext: object | null = null;
  public _isSVG = false;
  public _updating: boolean = true;

  public __FP: boolean = false; // Flush Pending
  public __FCB: Function[] | null = null; // Flush callbacks for this component

  constructor(props?: P, context?: any) {
    /** @type {object} */
    this.props = props || (EMPTY_OBJ as P);

    /** @type {object} */
    this.context = context || EMPTY_OBJ; // context should not be mutable
  }

  // LifeCycle methods
  public componentDidMount?(): void;

  public componentWillMount?(): void;

  public componentWillReceiveProps?(nextProps: P, nextContext: any): void;

  public shouldComponentUpdate?(
    nextProps: P,
    nextState: S,
    nextContext: any
  ): boolean;

  public componentWillUpdate?(
    nextProps: P,
    nextState: S,
    nextContext: any
  ): void;

  public componentDidUpdate?(
    prevProps: P,
    prevState: S,
    prevContext: any
  ): void;

  public componentWillUnmount?(): void;

  public getChildContext?(): void;

  public forceUpdate(callback?: Function) {
    if (this._unmounted || this._updating || !isBrowser) {
      return;
    }

    queueStateChange(this, true, callback);
  }

  public setState(newState: S | Function, callback?: Function) {
    if (this._unmounted) {
      return;
    }
    if (!this._blockSetState) {
      queueStateChanges(this, newState, callback);
    } else {
      if (process.env.NODE_ENV !== "production") {
        throwError(
          "cannot update state via setState() in componentWillUpdate() or constructor."
        );
      }
      throwError();
    }
  }

  // tslint:disable-next-line:no-empty
  public render(nextProps?: P, nextState?, nextContext?): any {}
}
