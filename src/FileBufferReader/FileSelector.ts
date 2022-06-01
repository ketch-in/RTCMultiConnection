import { InputFileElement, SelectFile } from "./types";

class FileSelector {
  accept: string;
  noFileSelectedCallback: () => void;

  constructor() {
    this.accept = "*.*";
    this.noFileSelectedCallback = () => {};
  }

  setNoFileSelectedCallback(failure: () => void) {
    this.noFileSelectedCallback = failure;
  }

  selectSingleFile(callback: any, failure: () => void) {
    if (failure) {
      this.setNoFileSelectedCallback(failure);
    }

    this.selectFile(callback);
  }
  selectMultipleFiles(callback: any, failure: () => void) {
    if (failure) {
      this.setNoFileSelectedCallback(failure);
    }

    this.selectFile(callback, true);
  }
  selectDirectory(callback: any, failure: () => void) {
    if (failure) {
      this.setNoFileSelectedCallback(failure);
    }

    this.selectFile(callback, true, true);
  }

  selectFile(
    callback?: (arg0: any[] | File) => void,
    multiple?: boolean,
    directory?: boolean
  ) {
    const cb = callback || function () {};

    const file = document.createElement("input") as InputFileElement;
    file.type = "file";
    file.multiple = !!multiple;
    file.webkitdirectory = !!directory;
    file.accept = this.accept;

    file.onclick = () => {
      file.clickStarted = true;
    };

    document.body.onfocus = () => {
      setTimeout(function () {
        if (!file.clickStarted) return;
        file.clickStarted = false;

        if (!file.value) {
          this.noFileSelectedCallback();
        }
      }, 500);
    };

    file.onchange = function () {
      if (multiple) {
        if (!file.files.length) {
          console.error("No file selected.");
          return;
        }

        var arr = [];
        Array.from(file.files).forEach(function (file) {
          const selectFile = file as SelectFile;
          selectFile.url = file.webkitRelativePath;
          arr.push(selectFile);
        });
        cb(arr);
        return;
      }

      if (!file.files[0]) {
        console.error("No file selected.");
        return;
      }

      cb(file.files[0]);

      file.parentNode.removeChild(file);
    };
    file.style.display = "none";
    (document.body || document.documentElement).appendChild(file);
    this.fireClickEvent(file);
  }

  getValidFileName(fileName?: string) {
    return (
      fileName || `file${new Date().toISOString().replace(/:|\.|-/g, "")}`
    )
      .replace(/^.*[\\\/]([^\\\/]*)$/i, "$1")
      .replace(/\s/g, "_")
      .replace(/,/g, "")
      .toLowerCase();
  }

  fireClickEvent(element: HTMLInputElement & { change?: () => void }) {
    if (typeof element.click === "function") {
      element.click();
      return;
    }

    if (typeof element.change === "function") {
      element.change();
      return;
    }

    if (typeof document.createEvent("Event") !== "undefined") {
      const event = document.createEvent("Event");

      if (
        typeof event.initEvent === "function" &&
        typeof element.dispatchEvent === "function"
      ) {
        event.initEvent("click", true, true);
        element.dispatchEvent(event);
        return;
      }
    }

    const event = new MouseEvent("click", {
      view: window,
      bubbles: true,
      cancelable: true,
    });

    element.dispatchEvent(event);
  }
}

export const fileSelector = new FileSelector();

(window as Window & { fileSelector?: FileSelector }).fileSelector =
  fileSelector;
