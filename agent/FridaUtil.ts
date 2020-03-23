export const gettid = new NativeFunction(Module.getExportByName(null, "gettid"), "uint32", []);

export const getpid = new NativeFunction(Module.getExportByName(null, "getpid"), "uint32", []);

export const getuid = new NativeFunction(Module.getExportByName(null, "getuid"), "uint32", []);

export function nativeThreadTraceToString(traces: NativePointer[], tab: number) {
  let module;
  let tab_str = "";
  for (let i = 0; i !== tab; i++) {
    tab_str += "  ";
  }
  const stackTraces = [];
  for (let j = 0; j < traces.length; j++) {
    if (!traces.hasOwnProperty(j)) continue;
    const stackTrace = new class {
      index: number;
      moduleName: string;
      moduleBase: any;
      offset: string;
      address: any;

      constructor(index: number) {
        this.index = index;
        this.moduleName = "";
        this.moduleBase = NULL;
        this.offset = "";
        this.address = NULL;
      }

      toString() {
        return "idx: " + this.index +
          ", name: " + this.moduleName +
          ", base: " + this.moduleBase +
          ", offset: " + this.offset +
          ", address: " + this.address;
      };
    }(j);
    module = Process.findModuleByAddress(traces[j]);
    if (module) {
      stackTrace.moduleName = module.name;
      stackTrace.moduleBase = module.base;
    }
    stackTrace.address = traces[j];
    stackTrace.offset = "0x" + (parseInt(stackTrace.address) - parseInt(stackTrace.moduleBase)).toString(16);
    stackTraces.push(stackTrace);
  }
  return tab_str + stackTraces.join('\n' + tab_str);
}

export function javaThreadTraceToString(thread: Java.Wrapper, tabsize: number) {
  let tab_str = "";
  let ret;
  const stack_trace = thread.getStackTrace();
  // stack_trace.shift();
  // stack_trace.shift();
  for (let i = 0; i < tabsize; i++) {
    tab_str += "  ";
  }
  ret = tab_str + "Thread Stack Trace:\n";
  ret += tab_str + "  " + stack_trace.join("\n" + tab_str + "  ");
  return ret;
}

export function byteArrayToHexString(arybuf: any) {
  let u8arybuf = new Uint8Array(arybuf);
  let retstr = "";
  for (let i = 0; i < u8arybuf.length; i++) {
    let at = u8arybuf[i].toString(16);
    if (at.length < 2) at = "0" + at;
    retstr += at;
  }
  return retstr;
}

/**
 * for JavaScript AOP
 * @param beforeFunc: before function
 */
// @ts-ignore
Function.prototype.before = function (beforeFunc: Function) {
  const _self = this;
  return function () {
    // @ts-ignore
    const _this = this;
    let javaUse = beforeFunc.apply(_this, arguments);
    if (javaUse)
      return javaUse;
    return _self.apply(_this, arguments);
  }
};

/**
 * for JavaScript AOP
 * @param afterFunc: after function
 */
// @ts-ignore
Function.prototype.after = function (afterFunc: Function) {
  const _self = this;
  return function () {
    // @ts-ignore
    var ret = _self.apply(this, arguments);

    afterFunc.apply(ret, arguments);
    return ret;
  }
};

class Fields {
  wrapper: Java.Wrapper;

  constructor(wrapper: Java.Wrapper) {
    this.wrapper = wrapper;
  }

  public find(name: string) {
    let field;
    try {
      field = this.wrapper.getDeclaredField(name);
    } catch (e) {
      field = this.wrapper.getField(name);
    }
    return field;
  };

  public findall() {
    let fields;
    fields = this.wrapper.getDeclaredFields();
    fields.concat(this.wrapper.getFields());
    return fields;
  };

  public get(name: string, obj: any) {
    let notAccessible;
    let ret;
    let field = this.find(name);
    notAccessible = !field.isAccessible();
    if (notAccessible) field.setAccessible(true);
    ret = field.get.overload("java.lang.Object").call(field, obj);
    if (!notAccessible) field.setAccessible(false);
    return ret;
  };

  public set(name: string, obj: any, val: any) {
    let isAccessible;
    let field = this.find(name);
    isAccessible = field.isAccessible();
    if (!isAccessible) field.setAccessible(true);
    field.set.overload('java.lang.Object', 'java.lang.Object').call(field, obj, val);
    if (!isAccessible) field.setAccessible(false);
  };
}

class Methods {
  wrapper: Java.Wrapper;

  constructor(wrapper: Java.Wrapper) {
    this.wrapper = wrapper;
  }

  find(name: string, ...args: any) {
    let method: any;
    try {
      method = this.wrapper.getDeclaredMethod(name, args);
    } catch (e) {
      method = this.wrapper.getMethod(name, args);
    }
    return function (obj: any, ...args: any) {
      let isAccessible;
      let ret;
      isAccessible = method.isAccessible();
      if (!isAccessible) method.setAccessible(true);
      ret = method.invoke(obj, args);
      if (!isAccessible) method.setAccessible(false);
      return ret;
    };
  };
}


let javaUseMapping = {};

// Hook Java.use
// @ts-ignore
Java.use = Java.use.before(function (className: string) {
  // @ts-ignore
  if (javaUseMapping[className]) {
    console.log("Java.use.before: cache used.");
    // @ts-ignore
    return javaUseMapping[className];
  }
  return null;
});

// Hook Java.use
// @ts-ignore
Java.use = Java.use.after(function (className) {
  // Hook Java.use 并为 Java.use 的返回值添加 `$fields` 字段; Java.use 返回值的类型为 Java.Wrapper
  // @ts-ignore
  this.$fields = new Fields(this.class);

  // @ts-ignore
  this.$methods = new Methods(this.class);

  // @ts-ignore
  javaUseMapping[className] = this;
});

export function getCurrentApplication() {
  try {
    let rActivityThread = Java.use('android.app.ActivityThread');
    return rActivityThread.currentApplication();
  } catch (e) {
    return null;
  }
}

export function getApplicationContext() {
  try {
    let rActivityThread = Java.use('android.app.ActivityThread');
    return rActivityThread.currentApplication().getApplicationContext();
  } catch (e) {
    return null;
  }
}

export function nativeHook_RegisterNatives_onEnter(args: any) {
  // @ts-ignore
  let _this = this;
  _this.tag = "RegisterNatives";
  _this.env = args[0];
  _this.clazz = args[1];
  _this.methods = args[2];
  _this.nMethods = parseInt(args[3]);

  let log = "> - - - - - - - - - - - - - - - - - - tid:[" + gettid() + "] - - - - - - - - - - - - - - - - - - <\n";
  log += _this.tag + " Enter.\n";
  log += "  env: " + _this.env + "\n";
  log += "  clazz: " + Java.vm.getEnv().getClassName(_this.clazz) + "\n";
  log += "  methods: " + _this.methods + "\n";
  log += "  nMethods: " + _this.nMethods + "\n";
  for (let i = 0; i < _this.nMethods; i++) {

    let methodName = _this.methods.add(i * (Process.pointerSize * 3)).readPointer().readCString();
    let methodSig = _this.methods.add(i * (Process.pointerSize * 3) + (Process.pointerSize)).readPointer().readCString();
    let methodPtr = _this.methods.add(i * (Process.pointerSize * 3) + (Process.pointerSize * 2)).readPointer();
    let methodMod = <Module>Process.findModuleByAddress(methodPtr);

    log += "    " + (i + 1) + ":\n";
    log += "      methodName: " + methodName + "\n";
    log += "      methodSig: " + methodSig + "\n";
    log += "      methodPtr: " + methodPtr + ", off: " + methodPtr.sub(methodMod.base) + "\n";
    log += "      methodLib: " + methodMod.name + ", base: " + methodMod.base + "\n";
    log += "\n";
  }
  console.log(log);
}

export function nativeHook_RegisterNatives_onLeave(retval: any) {
  // @ts-ignore
  let log = this.tag + " Leave.\n";
  log += "  retval: " + retval + "\n";
  log += "> - - - - - - - - - - - - - - - - - - tid:[" + gettid() + "] - - - - - - - - - - - - - - - - - - <\n";
  console.log(log);
}

