type FileElement = HTMLInputElement & {
  clickStarted: boolean;
  change: Function;
};

interface SelectFileCallback {
  (files: File | File[]): void;
}

type FileWithUrl = File & {
  url: string;
};

export default class FileSelector {
  accept: string;
  noFileSelectedCallback: Function;

  constructor() {
    this.accept = "*.*";
    this.noFileSelectedCallback = () => {};
  }

  selectSingleFile(callback: SelectFileCallback, failure?: Function) {
    if (failure) {
      this.noFileSelectedCallback = failure;
    }

    this.selectFile(callback, true);
  }

  selectMultipleFiles(callback: SelectFileCallback, failure?: Function) {
    if (failure) {
      this.noFileSelectedCallback = failure;
    }

    this.selectFile(callback, true);
  }

  selectDirectory(callback: SelectFileCallback, failure?: Function) {
    if (failure) {
      this.noFileSelectedCallback = failure;
    }

    this.selectFile(callback, true, true);
  }

  selectFile(callback: SelectFileCallback = () => {}, multiple?: boolean, directory?: boolean) {
    const fileElement = document.createElement("input") as FileElement;

    fileElement.type = "file";

    if (multiple) {
      fileElement.multiple = true;
    }

    if (directory) {
      fileElement.webkitdirectory = true;
    }

    fileElement.onclick = () => {
      fileElement.clickStarted = true;
    };

    document.body.onfocus = () => {
      setTimeout(() => {
        if (!fileElement.clickStarted) {
          return;
        }
        fileElement.clickStarted = false;

        if (!fileElement.value) {
          this.noFileSelectedCallback();
        }
      }, 500);
    };

    fileElement.onchange = () => {
      if (multiple) {
        if (!fileElement.files?.length) {
          console.error("No file selected.");
          return;
        }

        const selectedFiles: FileWithUrl[] = [];
        Array.from(fileElement.files).forEach(file => {
          const selectedFile = file as FileWithUrl;

          selectedFile.url = file.webkitRelativePath;
          selectedFiles.push(selectedFile);
        });

        callback(selectedFiles);
        return;
      }

      if (!fileElement.files || !fileElement.files[0]) {
        console.error("No file selected.");
        return;
      }

      callback(fileElement.files[0]);
      (fileElement.parentNode as ParentNode).removeChild(fileElement);
    };

    fileElement.style.display = "none";
    (document.body || document.documentElement).appendChild(fileElement);

    this.fireClickEvent(fileElement);
  }

  getValidFileName(fileName?: string) {
    if (!fileName) {
      fileName = "file" + new Date().toISOString().replace(/:|\.|-/g, "");
    }

    return fileName
      .replace(/^.*[\\\/]([^\\\/]*)$/i, "$1")
      .replace(/\s/g, "_")
      .replace(/,/g, "")
      .toLowerCase();
  }

  fireClickEvent(fileElement: FileElement) {
    if (typeof fileElement.click === "function") {
      fileElement.click();
      return;
    }

    if (typeof fileElement.change === "function") {
      fileElement.change();
      return;
    }

    if (typeof document.createEvent("Event") !== "undefined") {
      const event = document.createEvent("Event");

      if (typeof event.initEvent === "function" && typeof fileElement.dispatchEvent === "function") {
        event.initEvent("click", true, true);
        fileElement.dispatchEvent(event);
        return;
      }
    }

    const event = new MouseEvent("click", {
      view: window,
      bubbles: true,
      cancelable: true,
    });

    fileElement.dispatchEvent(event);
  }
}
