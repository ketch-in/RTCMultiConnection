const browserFakeUserAgent =
  "Fake/5.0 (FakeOS) AppleWebKit/123 (KHTML, like Gecko) Fake/12.3.4567.89 Fake/123.45";

function amd(that) {
  if (!that) {
    return;
  }

  if (typeof window !== "undefined") {
    return;
  }

  if (typeof global === "undefined") {
    return;
  }

  (<any>global.navigator) = {
    userAgent: browserFakeUserAgent,
    getUserMedia: function () {},
  };

  if (!global.console) {
    global.console = {} as Console;
  }

  if (typeof global.console.debug === "undefined") {
    global.console.debug =
      global.console.info =
      global.console.error =
      global.console.log =
        global.console.log ||
        function () {
          console.log(arguments);
        };
  }

  if (typeof document === "undefined") {
    /*global document:true */
    that.document = {};

    that.document.createElement =
      that.document.captureStream =
      that.document.mozCaptureStream =
        function () {
          var obj = {
            getContext: function () {
              return obj;
            },
            play: function () {},
            pause: function () {},
            drawImage: function () {},
            toDataURL: function () {
              return "";
            },
          };
          return obj;
        };

    that.document.addEventListener =
      that.document.removeEventListener =
      that.addEventListener =
      that.removeEventListener =
        function () {};

    that.HTMLVideoElement = that.HTMLMediaElement = function () {};
  }

  if (typeof that.io === "undefined") {
    that.io = function () {
      return {
        on: function (eventName, callback) {
          callback = callback || function () {};

          if (eventName === "connect") {
            callback();
          }
        },
        emit: function (eventName, data, callback) {
          callback = callback || function () {};
          if (eventName === "open-room" || eventName === "join-room") {
            callback(true, data.sessionid, null);
          }
        },
      };
    };
  }

  if (typeof location === "undefined") {
    /*global location:true */
    that.location = {
      protocol: "file:",
      href: "",
      hash: "",
      origin: "self",
    };
  }

  if (typeof screen === "undefined") {
    /*global screen:true */
    that.screen = {
      width: 0,
      height: 0,
    };
  }

  if (typeof URL === "undefined") {
    /*global screen:true */
    that.URL = {
      createObjectURL: function () {
        return "";
      },
      revokeObjectURL: function () {
        return "";
      },
    };
  }

  /*global window:true */
  that.window = global;

  return global;
}

export default amd(typeof global !== "undefined" ? global : null);
