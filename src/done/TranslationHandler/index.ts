import type { RTCMultiConnection } from "../types";
import type { TranslationResponse } from "./types";

import { getRandomString } from "../../utils";

function handle(connection: RTCMultiConnection) {
  connection.autoTranslateText = false;
  connection.language = "en";
  connection.googKey = "AIzaSyCgB5hmFY74WYB-EoWkhr9cAGr6TiTHrEE";

  connection.Translator = {
    TranslateText: (text, callback) => {
      const newScript = document.createElement("script");
      newScript.type = "text/javascript";

      const sourceText = encodeURIComponent(text);

      const randomNumber = "method" + getRandomString();
      window[randomNumber] = (response: TranslationResponse) => {
        if (response.data && response.data.translations[0] && callback) {
          callback(response.data.translations[0].translatedText);
          return;
        }

        if (response.error && response.error.message === "Daily Limit Exceeded") {
          console.error('Text translation failed. Error message: "Daily Limit Exceeded."');
          return;
        }

        if (response.error) {
          console.error(response.error.message);
          return;
        }

        console.error(response);
      };

      const source = `https://www.googleapis.com/language/translate/v2?key=${connection.googKey}&target=${
        connection.language || "en-US"
      }&callback=window.${randomNumber}&q=${sourceText}`;

      newScript.src = source;
      document.getElementsByTagName("head")[0].appendChild(newScript);
    },
    getListOfLanguages: callback => {
      const xhr = new XMLHttpRequest();

      xhr.onreadystatechange = () => {
        if (xhr.readyState == XMLHttpRequest.DONE) {
          const response = JSON.parse(xhr.responseText) as TranslationResponse;

          if (response && response.data && response.data.languages) {
            callback(response.data.languages);
            return;
          }

          if (response.error && response.error.message === "Daily Limit Exceeded") {
            console.error('Text translation failed. Error message: "Daily Limit Exceeded."');
            return;
          }

          if (response.error) {
            console.error(response.error.message);
            return;
          }

          console.error(response);
        }
      };

      const url = `https://www.googleapis.com/language/translate/v2/languages?key=${connection.googKey}&target=en`;
      xhr.open("GET", url, true);
      xhr.send(null);
    },
  };
}

export default {
  handle,
};
