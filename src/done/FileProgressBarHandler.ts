import type { RTCMultiConnection } from "./types";

type FileInfo = File & {
  uuid: string;
  remoteUserId: string;
  maxChunks: number;
  currentPosition: number;
  url: string;
};

interface ProgressHelper {
  [uuid: string]: {
    div?: HTMLDivElement;
    progress?: HTMLProgressElement;
    label?: HTMLLabelElement;
  };
}

function updateLabel(progress: HTMLProgressElement, label: HTMLLabelElement) {
  if (progress.position === -1) {
    return;
  }

  const position = +progress.position.toFixed(2).split(".")[1] || 100;
  label.innerHTML = position + "%";
}

function handle(connection: RTCMultiConnection) {
  const progressHelper: ProgressHelper = {};

  connection.onFileStart = (file: FileInfo) => {
    const div = document.createElement("div");
    div.title = file.name;
    div.innerHTML = "<label>0%</label> <progress></progress>";

    if (file.remoteUserId) {
      div.innerHTML += ` (Sharing with:${file.remoteUserId})`;
    }

    if (!connection.filesContainer) {
      connection.filesContainer = document.body || document.documentElement;
    }

    connection.filesContainer.insertBefore(div, connection.filesContainer.firstChild);

    if (!file.remoteUserId) {
      progressHelper[file.uuid] = {
        div,
        progress: div.querySelector("progress") as HTMLProgressElement,
        label: div.querySelector("label") as HTMLLabelElement,
      };

      (progressHelper[file.uuid].progress as HTMLProgressElement).max = file.maxChunks;
      return;
    }

    if (!progressHelper[file.uuid]) {
      progressHelper[file.uuid] = {};
    }

    progressHelper[file.uuid][file.remoteUserId] = {
      div: div,
      progress: div.querySelector("progress"),
      label: div.querySelector("label"),
    };
    progressHelper[file.uuid][file.remoteUserId].progress.max = file.maxChunks;
  };

  connection.onFileProgress = (file: FileInfo) => {
    let helper = progressHelper[file.uuid];
    if (!helper) {
      return;
    }

    if (file.remoteUserId) {
      helper = progressHelper[file.uuid][file.remoteUserId];
      if (!helper) {
        return;
      }
    }

    if (helper.progress && helper.label) {
      helper.progress.value = file.currentPosition || file.maxChunks || (helper?.progress?.max as number);
      updateLabel(helper.progress, helper.label);
    }
  };

  connection.onFileEnd = (file: FileInfo) => {
    let helper = progressHelper[file.uuid];
    if (!helper) {
      console.error("No such progress-helper element exist.", file);
      return;
    }

    if (file.remoteUserId) {
      helper = progressHelper[file.uuid][file.remoteUserId];
      if (!helper) {
        return;
      }
    }

    const div = helper.div as HTMLDivElement;
    if (file.type.indexOf("image") > -1) {
      div.innerHTML = `<a href="${file.url}" download="${file.name}">Download <strong style="color:red;">${file.name}</strong> </a>
            <br /><img src="${file.url}" title="${file.name}" style="max-width: 80%;"></img>`;
    } else {
      div.innerHTML = `<a href="${file.url}" download="${file.name}">Download <strong style="color:red;">${file.name}</strong> </a>
            <br /><img src="${file.url}" title="${file.name}" style="width: 80%;border: 0;height: inherit;margin-top:1em;"></img>`;
    }
  };
}

export default {
  handle,
};
