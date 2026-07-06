# 26s-w1-c1-07

## Common Assignment I: Web-based Project (teams of 2)

**Goal:** Work through a common assignment together to quickly learn the full flow of web development and adapt to collaboration

**Deliverables:** A web service completed from planning through deployment, plus all related documents

---

## Team

| Name | GitHub | Role |
|---|---|---|
| Park Junseo | bjsbest |  |
| Lee Jonghyeok | jonghklee |  |

---

## Proposal

> Summarize the project topic, goal, core features, expected users, per-member roles, etc.

- **Topic:**
- **Goal:**
- **Core features:**
- **Expected users:**

---

## Feature Specification

> Organize the features to implement from the user's perspective, and distinguish required from optional features

### Required features

- [ ]

### Optional features

- [ ]

---

## IA and Screen Design

> The overall page structure of the service and the navigation flow between pages; summarize each page's main UI composition, input elements, buttons, and user action flow as a simple wireframe

<!-- Attach a Figma link or image -->

---

## DB Schema

> Summarize the needed tables, main fields, data types, and relationships between tables

- **Engine/setup**: MySQL 8 (inside the KAIST VM at `localhost:3306`, `utf8mb4`), managed with Prisma.
- **7 tables**: `user_group` (class) · `app_user` (Google user) · `admin_account` (admin) · `game` (game dictionary) · `game_match` (match result) · `match_edit_history` (edit audit) · `score_config` (score settings).
- **Core rules**: record online matches only · soft delete (`deleted_at`) · scores/rankings are not stored but aggregated at query time · match result is `ENUM('P1_WIN','P2_WIN','DRAW')`.

📄 Details: **[docs/DATABASE.md](docs/DATABASE.md)** (implementation, access, queries) · **[docs/ERD.md](docs/ERD.md)** (canonical design, rationale)

```bash
# Apply schema + seed (when using the VM DB via SSH tunnel)
ssh -N -L 3306:localhost:3306 kaistvm &        # tunnel
npm --workspace @madpump/server run migrate:deploy
npm --workspace @madpump/server run db:seed
```

---

## API Documentation

> Summarize the API address, request method, request values, response values, and error cases

| Method | Endpoint | Description | Request | Response |
|---|---|---|---|---|
|  |  |  |  |  |

---

## Deployment Deliverable

> An accessible link, how to run it, and the main implementation details

- **Service URL:**
- **How to run:**

```bash
# Write how to run it here
```

---

## Retrospective

> Difficulties during development, how they were solved, role distribution, and what to improve next time (see the KPT methodology)

### Keep

### Problem

### Try

---

## References

- [Understanding SDD (Spec-Driven Development)](https://news.hada.io/topic?id=21338)
- [Software Design Document Best Practices](https://www.atlassian.com/work-management/project-management/design-document)
- [How to write an IA information architecture diagram](https://brunch.co.kr/@nyonyo/7)
- [How a planner writes a screen design document](https://brunch.co.kr/@soup/10)
- [Figma wireframe guide](https://www.figma.com/ko-kr/resource-library/what-is-wireframing/)
- [Free Figma wireframe kit](https://www.figma.com/ko-kr/templates/wireframe-kits/)
- [ERD/DB design roundup](https://inpa.tistory.com/entry/DB-%F0%9F%93%9A-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8%EB%A7%81-%EA%B0%9C%EB%85%90-ERD-%EB%8B%A4%EC%9D%B4%EC%96%B4%EA%B7%B8%EB%9E%A8)
- [API specification writing guidelines](https://velog.io/@sebinChu/BackEnd-API-%EB%AA%85%EC%84%B8%EC%84%9C-%EC%9E%91%EC%84%B1-%EA%B0%80%EC%9D%B4%EB%93%9C-%EB%9D%BC%EC%9D%B8)
- [How to write a good README](https://velog.io/@sabo/good-readme)
- [Short-project retrospective KPT methodology](https://velog.io/@habwa/%EB%8B%A8%EA%B8%B0-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%ED%9A%8C%EA%B3%A0-KPT-%EB%B0%A9%EB%B2%95%EB%A1%A0)
