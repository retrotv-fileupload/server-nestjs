# FileServer API

NestJS와 TypeScript로 구축된 파일 서버 API입니다.

## 기술 스택

- **프레임워크**: NestJS
- **언어**: TypeScript
- **ORM**: TypeORM
- **데이터베이스**: MySQL
- **코드 품질**: ESLint + Prettier

## 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
`.env` 파일에서 데이터베이스 연결 정보를 설정하세요.

### 3. 개발 서버 실행
```bash
npm run start:dev
```

### 4. 프로덕션 빌드
```bash
npm run build
npm run start:prod
```

## 사용 가능한 스크립트

- `npm run start:dev` - 개발 모드로 서버 실행 (파일 변경 시 자동 재시작)
- `npm run build` - TypeScript 컴파일
- `npm run start` - 프로덕션 모드로 서버 실행
- `npm run lint` - ESLint 실행 및 자동 수정
- `npm run format` - Prettier로 코드 포맷팅

## API 엔드포인트

- `GET /` - Hello World 메시지
- `GET /health` - 서버 상태 확인

## 개발 환경

이 프로젝트는 다음과 같은 개발 도구들이 설정되어 있습니다:

- **ESLint**: 코드 품질 및 스타일 검사
- **Prettier**: 코드 자동 포맷팅
- **TypeScript**: 정적 타입 검사
- **Nodemon**: 개발 중 자동 재시작
