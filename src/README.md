# TS Project

## 작업 가이드

1. 터미널을 두개 띄웁니다.

2. 1번 터미널에서 `npm run local-dev-server`를 입력 후 엔터를 누릅니다.

3. 2번 터미널에서 `npm run local-dev-vite`를 입력 후 엔터를 누릅니다.

4. src 내에 있는 ts 파일을 작업 후 `localhost:3000` 에서 `Open or Join Broadcast` 버튼을 통해 화면이 출력되는 지 확인합니다.

5. 화면이 정상적으로 출력된다면 문제 없이 동작하는 것입니다!

## CLI

### dev

docker에서 ts 파일을 빌드해서 예제 파일을 돌립니다.

```bash
npm run dev
```

Go to http://localhost:3000

### local-dev

local에서 코드 수정시 실시간으로 동작여부를 확인하는 데모를 실행합니다.
각 터미널에서 각각 실행해야합니디.

```bash
// 터미널 1
npm run local-dev-vite

// 터미널 2
npm run local-dev-server
```

### build

해당 명령어는 준비중입니다.
