# DCCon for BetterDiscord

Discord 채팅 입력창에서 디시콘을 찾아 이미지 첨부로 보내는 BetterDiscord 플러그인입니다.

<img src="images/picker.png" alt="디시콘 선택창" width="520">

## 주요 기능

- 채팅 입력창의 만두 버튼으로 디시콘 메뉴 열기
- 디시콘 팩 검색·추가·제거, 등록한 콘 검색
- 좌측 팩 탐색, 최근 사용, 즐겨찾기
- 일반 클릭으로 즉시 전송, Shift+클릭으로 여러 콘 모으기
- (설정으로) 입력창에 이미지 첨부

## 설치

Discord에 [BetterDiscord](https://betterdiscord.app/) 설치가 필요합니다.

1. `DCCon.plugin.js` 파일을 다운
2. Discord의 **설정 → BetterDiscord → 플러그인 → 플러그인 폴더 열기**로 폴더를 열고
3. 해당 폴더에 파일을 복사하고 DCCon을 활성화
4. 변경 내용이 반영되지 않으면 Discord에서 `Ctrl+R`로 새로고침

Windows의 일반적인 설치 경로:

```text
%APPDATA%\BetterDiscord\plugins\DCCon.plugin.js
```

## 사용법

### 선택창 열기와 팩 추가

채팅 입력창 오른쪽의 **만두 버튼**을 클릭하면 디시콘 선택창이 열립니다.

<img src="images/composer-button.png" alt="만두 버튼" width="420">

**팩 추가 / 관리 → 디시콘샵**에서 이름을 검색하고 **디시콘 추가**를 누릅니다. 추가한 팩은 **내 디시콘** 탭에서 선택할 수 있습니다.

<img src="images/pack-search.png" alt="디시콘샵에서 고양이 검색" width="520">

### 기본 모드

| 조작 | 동작 |
| --- | --- |
| 일반 클릭 | 모아둔 콘과 클릭한 콘을 한 메시지로 전송하고 선택창 닫기 |
| Shift+클릭 | 디시콘 누적 하면서 선택창 유지 |
| 버퍼 썸네일 클릭 | 해당 콘 제거 |
| 전체 비우기 | 현재 채널의 버퍼 비우기 |
| ☆ / ★ | 즐겨찾기 추가 / 해제 |

Shift+클릭한 콘은 선택창 아래의 **모아둔 콘** 목록에 표시됩니다. 아래 예시는 콘 3개를 모은 상태입니다. 다음 콘을 일반 클릭하면 총 4개가 한 메시지로 전송됩니다.

<img src="images/selection-buffer.png" alt="여러개보내기" width="520">

Shift로 최대 9개를 모을 수 있습니다. 마지막 일반 클릭까지 포함하면 최대 10개를 전송합니다. 동일한 콘도 여러 번 모을 수 있습니다.

기본 모드는 작성 중인 글, 직접 첨부한 다른 파일 등등과 상호작용 하지 않고 바로 전송됩니다.

### 첨부 전용 모드

**설정 → 첨부 전용 모드**를 켭니다.

<img src="images/file-attach-mode.png" alt="첨부모드" width="520">

일반 클릭과 Shift+클릭 모두 Discord 입력창에 파일을 첨부하고 선택창을 유지합니다. 메시지는 입력창에서 직접 전송합니다.

## 이미지 캐시

팩 추가 시 이미지를 캐싱해두고 그것을 씁니다.

캐시 위치:

```text
%APPDATA%\BetterDiscord\plugins\DCCon-cache\
```

캐시 용량 제한과 자동 정리는 없습니다.

## 진단

문제가 있으면 **설정 → 문제 해결 · 버그 제보**에서 마지막 전송 결과를 확인할 수 있습니다.

이슈 제보 시 이것을 사용해 에러 메세지를 확인해서 같이 올려주세요.

## 출처 및 라이선스

- 원본 프로젝트: **DCCon2**, 이전 주소 `https://github.com/minibox24/DCCon2` — 현재 삭제
- 참고 프로젝트: [Dastan21/BDAddons — FavoriteMedia](https://github.com/Dastan21/BDAddons/blob/main/plugins/FavoriteMedia/FavoriteMedia.plugin.js)
- 라이선스: [GNU GPL v3](LICENSE) — 원본 라이선스
