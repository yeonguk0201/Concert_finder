# Reissue/NOL 실제 DOM 최소 fixture

2026-10-22 KST에 프록시·TLS 검증을 유지하고 두 robots.txt와 대상 HTML을 HTTP 200으로 읽었다. 원문 응답 해시와 확인 시각은 [provenance.json](provenance.json)에 있다. 전체 원문은 로컬 관측 폴더 `/workspace/reissue-live-verification`에만 보관한다.

`reissue-detail.html`은 실제 `.single.single_news.single_detail`의 sibling header와 article, 연도행 및 Taipei 1행/Seoul 3행을 보존한 발췌다. 나머지 도시·이미지·공유 컨트롤·본문 설명은 제거했다. `nol-product.html`은 실제 제목·상대 시각·절대 일반 예매·기간·개별 회차·장소·주소·국제 예매 링크 노드의 발췌다. 장소와 주소의 소속을 검증하도록 실제 `section#venue` 계층도 보존했다. 스크립트/이미지/비공개 API 데이터는 포함하지 않는다. 선택한 노드의 속성과 텍스트는 원문 그대로다.

테스트의 `mb:00000000-0000-4000-8000-000000000001`은 파서 입력용 가상 key다. 실제 요네즈 켄시 MBID를 뜻하지 않고 운영 입력·source 목록·DB에 사용하지 않는다. 같은 상품 링크와 일정 일치를 아티스트 신원 검증 완료로 세지 않는다. robots 허용은 이용 약관 검증을 대신하지 않으며 발표 날짜에서 시각을 생성하지 않는다. 출시 조건과 빈 운영 source 목록을 유지한다.
