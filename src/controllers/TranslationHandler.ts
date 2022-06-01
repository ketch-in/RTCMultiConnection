import { getRandomString } from "../utils";

const GOOGLE_TRANSLATE_API_URL =
  "https://www.googleapis.com/language/translate/v2";

function handleError(response) {
  const { error } = response || {};
  if (error && error?.message === "Daily Limit Exceeded") {
    return console.error(
      'Text translation failed. Error message: "Daily Limit Exceeded."'
    );
  }
  console.error(error ? error.message : response);
}

export default class TranslationHandler {
  googKey: string;
  language: "en-US" | "ko-KR";

  constructor(googKey: string, language: "en-US" | "ko-KR") {
    this.googKey = googKey;
    this.language = language;
  }

  translateText(text, callback) {
    const sourceText = encodeURIComponent(text);
    const randomNumber = `method${getRandomString()}`;

    window[randomNumber] = (response) => {
      const { data = {} } = response || {};
      if (data && data?.translations[0] && callback) {
        return callback(data?.translations[0].translatedText);
      }
      return handleError(response);
    };

    const queries = [
      `key=${this.googKey}`,
      `target=${this.language}`,
      `callback=window.${randomNumber}`,
      `q=${sourceText}`,
    ];
    const newScript = document.createElement("script");
    newScript.type = "text/javascript";
    newScript.src = `${GOOGLE_TRANSLATE_API_URL}?${queries.join("&")}`;
    document.getElementsByTagName("head")[0].appendChild(newScript);
  }

  getListOfLanguages(callback) {
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        const response = JSON.parse(xhr.responseText);

        if (response && response.data && response.data.language) {
          return callback(response.data.language);
        }

        return handleError(response);
      }
    };
    const queries = [`key=${this.googKey}`, `target=en`];
    xhr.open(
      "GET",
      `${GOOGLE_TRANSLATE_API_URL}/languages?${queries.join("&")}`
    );
    xhr.send(null);
  }
}
