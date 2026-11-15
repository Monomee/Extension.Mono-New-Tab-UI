# Mono New Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extension MV3 thay New Tab bằng màn hình chính kiểu iPad (lưới nhiều trang, dock, widget, ảnh nền, sao lưu JSON).

**Architecture:** Trang tĩnh, ES modules không build. `state.js` thuần (mặc định, validate, chuẩn hóa URL) + lưu trữ; `widgets.js` render widget; `app.js` render lưới/dock, chế độ chỉnh sửa, cài đặt, ảnh nền.

**Tech Stack:** HTML/CSS/JS thuần, SortableJS 1.15.6 (vendored), chrome.storage.local, IndexedDB, Node `assert` cho test.

**Spec:** `docs/design.md`

## Global Constraints
- Manifest V3, không JS inline; quyền đúng `storage`, `unlimitedStorage`, `favicon`.
- Không dịch vụ ngoài ngoài `_favicon` nội bộ và URL ảnh người dùng dán.
- Link chỉ http/https.
- Định dạng ngày giờ `vi-VN`.
- Dock chỉ chứa link.

## Review Focus
1. Nhập JSON hỏng / sai kiểu / có `javascript:` URL → báo lỗi, dữ liệu cũ giữ nguyên. (test trong Task 1)
2. URL gõ thiếu scheme (`youtube.com`) → `https://youtube.com/`; chuỗi rác → từ chối. (Task 1)
3. Storage trống lần đầu → state mặc định hợp lệ. (Task 1)
4. Ảnh nền URL lỗi tải → quay về gradient mặc định, không màn trắng. (Task 2, kiểm tay)
5. Xóa widget ghi chú/todo có nội dung → phải xác nhận; dữ liệu note/todo bị dọn khi widget xóa. (Task 4, kiểm tay)

---

### Task 1: state.js + test
**Files:** Create `package.json` (`{"type":"module"}` để Node chạy ESM), `state.js`, `test/validate.test.js`

**Interfaces — Produces:**
- `normalizeUrl(input: string) -> string|null`
- `defaultState() -> State`
- `validateState(obj: unknown) -> State` (ném `Error` nếu sai)
- `uid() -> string`
- `loadState() -> Promise<State>`, `saveState(state) -> Promise<void>` (chrome.storage.local, khóa `state`)

- [ ] Test: `normalizeUrl('youtube.com') === 'https://youtube.com/'`; `normalizeUrl('javascript:alert(1)') === null`; `normalizeUrl('') === null`; `validateState(defaultState())` deep-equal; `validateState({})` throws; link `javascript:` trong pages bị loại; trường lạ bị bỏ; dock bỏ widget.
- [ ] Chạy `node test/validate.test.js` → fail; implement; chạy lại → in `ok`.

### Task 2: Vỏ trang + ảnh nền
**Files:** `manifest.json`, `newtab.html`, `style.css`, `app.js` (phần wallpaper)
- IndexedDB `mono` / store `wallpaper` / key `current` → `Blob` | `{url}`. `setWallpaper(v)`, `applyWallpaper()`; lỗi tải → gradient.
- Lớp phủ `--dim`, `--bg-blur` từ settings.

### Task 3: Lưới, trang, dock, dialog link
- Render `pages` thành `.page` CSS grid trong `.pages` scroll-snap; chấm trang; dock. Icon `chrome-extension://<id>/_favicon/?pageUrl=…&size=64`, lỗi → chữ cái + màu theo hash tên miền.
- `<dialog>` thêm/sửa link dùng `normalizeUrl`.

### Task 4: Widget
**Files:** `widgets.js` — `renderWidget(item, state, save) -> HTMLElement`; clock (SVG kim), date, note (debounce 500ms), todo.

### Task 5: Chế độ chỉnh sửa
- Nhấn giữ 500ms hoặc ✎ → `body.editing`; rung, ×, "+" (link/widget), "Xong". Sortable group `grid` cho các trang, dock `put` chỉ khi item là link. Thêm trang trống cuối khi chỉnh sửa, xóa trang trống khi Xong. Sau kéo → đọc lại thứ tự DOM vào state, lưu.

### Task 6: Cài đặt + sao lưu
- Bảng ⚙: ảnh nền (file/URL/mặc định), dim, blur, search on/off, engine, Xuất/Nhập JSON (`validateState`, lỗi → alert-less thông báo trong bảng).
- Kiểm tay: load unpacked, mở tab mới, thử từng mục Review Focus.
