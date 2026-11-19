# Mono New Tab — Thiết kế

## Mục đích
Extension Chromium (Chrome, Brave, Edge…) thay trang New Tab bằng một "màn hình chính iPad":
ảnh nền tự chọn, lưới icon + widget nhiều trang vuốt ngang, dock truy cập nhanh ở đáy.
Dùng cá nhân, ưu tiên **đẹp, mở tab là hiện ngay, tự chỉnh dễ**.

## Mục tiêu (v1)
- Ảnh nền: tải ảnh từ máy hoặc dán URL; nút về nền mặc định.
- Lưới kiểu iPad, nhiều trang, vuốt/cuộn ngang, chấm chỉ trang.
- Dock kính mờ ở đáy: link tự thêm/xóa/kéo đổi chỗ; icon lấy từ favicon.
- Widget: Đồng hồ (kim), Ngày, Ghi chú, Todo. Thanh tìm kiếm ở trên cùng (bật/tắt).
- Chế độ chỉnh sửa kiểu iOS: nhấn giữ hoặc nút ✎ → icon rung, nút ×, kéo thả, nút "+" thêm link/widget, nút "Xong".
- Sao lưu / khôi phục toàn bộ cấu hình ra file JSON.

## Đã thêm sau v1
- **v1.1 Thư mục**: kéo lối tắt thả vào giữa lối tắt/thư mục khác để gộp; bảng thư mục đổi tên, sắp xếp, kéo ra ngoài; 1 lối tắt → tự gỡ. Chỉ ở trang, không lồng.
- **v1.2 Thời tiết**: widget 2×2 / 4×2 (dự báo 5 ngày), Open-Meteo (không cần key), thành phố chọn qua geocoding, lưu `settings.city`; cache 30 phút.
- **v1.2 Ảnh Bing mỗi ngày**: IndexedDB `{daily:'bing'}`; cache theo ngày (`bingCache`), lỗi mạng → ảnh cũ → gradient. Cần `host_permissions: https://www.bing.com/*` (Bing không có CORS).

- **v1.3 Icon dễ nhìn**: tự đổi nền ô sang tối khi favicon là logo sáng trên nền trong suốt (`needsDarkTile`, đo 32×32 qua canvas; ảnh khác nguồn không đo được → giữ nền trắng). Hộp sửa lối tắt: nền ô Tự động/Sáng/Tối/màu (`link.bg`), icon riêng bằng link (`link.icon` = URL) hoặc tải lên (`link.icon = 'upload'`, PNG 128px trong IndexedDB store `icons` theo id). Ảnh tải lên không nằm trong file sao lưu.

- **v1.4 Ngôn ngữ vi/en**: `i18n.js` (từ điển + `t()`, `translateDom()` qua `data-i18n`, `-ph`, `-title`, `-aria`), `settings.lang`; cài mới theo ngôn ngữ trình duyệt, dữ liệu cũ thiếu `lang` → `vi`. Ngày/thứ dùng `Intl` theo ngôn ngữ. Test bắt buộc hai từ điển cùng key và mọi key trong HTML tồn tại. Tên thư mục đã đặt là dữ liệu người dùng, không dịch.

- **v1.8 Tab = app đang chạy** (`tabs.js`, quyền `tabs`): lối tắt có tab đang mở cùng trang (cùng host, dưới path của link) → chấm dưới icon (dock) / trước tên (trang), badge đỏ = số tab khi ≥ 2; thư mục tính gộp. `settings.switchTab` (mặc định bật): bấm icon → kích hoạt tab dùng gần nhất, new tab trống tự đóng (trừ khi là tab cuối của cửa sổ hoặc có lịch sử). Ctrl/giữa chuột vẫn mở tab mới.
- **v1.9 Spotlight** (`spotlight.js`): thanh tìm kiếm gợi ý tab đang mở, lối tắt, (tuỳ chọn) dấu trang + lịch sử, gõ địa chỉ → "Mở trang", dòng cuối tìm web. Không phân biệt dấu ("ghi chu" ra "Ghi chú"). Ctrl/⌘+K hoặc `/` mở kể cả khi đã ẩn thanh tìm kiếm (làm tối nền). Dấu trang/lịch sử là `optional_permissions`, checkbox trong ⚙ chính là trạng thái quyền (không lưu setting riêng).

## Chưa làm
Pomodoro, đồng bộ giữa các máy, đổi kích thước widget bằng chuột.

## Phản mục tiêu (làm ra mà dính thì coi như hỏng)
- Mở tab mới bị chậm/nháy trắng.
- Gọi dịch vụ ngoài/theo dõi người dùng. Ngoại lệ có chủ đích: favicon nội bộ Chrome, ảnh URL do người dùng dán, Open-Meteo (chỉ khi có widget thời tiết), Bing (chỉ khi bật ảnh mỗi ngày).
- Mất dữ liệu (ghi chú, todo, link) khi thao tác sai hoặc import file hỏng.

## Ràng buộc
- Manifest V3: không có JS inline trong HTML; mọi script là file riêng.
- `chrome.storage.sync` chỉ ~100KB → không dùng; dùng `chrome.storage.local`.
- Ảnh nền có thể vài MB → lưu Blob trong IndexedDB, không lưu chuỗi base64.
- Brave hỏi "giữ trang New Tab này?" lần đầu — người dùng bấm giữ.

## Các hướng đã cân nhắc
| Hướng | Đánh đổi | Kết quả |
|---|---|---|
| **HTML/CSS/JS thuần + SortableJS** | Không build, nhẹ, sửa là thấy; code khó tổ chức hơn khi lớn | **Đã chọn** (người dùng chọn) |
| React + Vite | Component rõ; phải build, nặng hơn cần thiết | Loại |
| gridstack.js | Có resize widget; nặng, mặc định trông kiểu dashboard | Loại |

Bố cục: **lưới cố định kiểu iPad** (người dùng chọn), không đặt tự do.

## Giao diện
```
┌──────────────────────────────────────────────────────────┐
│                [ 🔍 Tìm kiếm Google...      ]        ✎ ⚙ │
│                                                          │
│   ┌─────────┐ ┌─────────┐  (G)  (YT)  (FB)              │
│   │  10:42  │ │ Thứ Hai │                               │
│   │ đồng hồ │ │   16    │  (GH)  (+)                    │
│   └─────────┘ └─────────┘                               │
│   ┌───────────────────┐ ┌─────────┐                     │
│   │ Ghi chú           │ │ Todo    │                     │
│   │ ...               │ │ ☐ ...   │                     │
│   └───────────────────┘ └─────────┘                     │
│                        ● ○                               │
│      ╭──────────────────────────────────────────╮        │
│      │ (G) (YT) (Gmail) (FB) (GH) ...   │  (+)  │  dock  │
│      ╰──────────────────────────────────────────╯        │
└──────────────────────────────────────────────────────────┘
```
- Ô lưới ~96px, khoảng cách ~24px; số cột tự tính theo chiều rộng màn hình (`repeat(auto-fill, …)`), `grid-auto-flow: dense` để xếp khít.
- Kích thước: icon 1×1; Đồng hồ, Ngày, Todo 2×2; Ghi chú 4×2 (2×2 cũng được, chọn khi thêm).
- Kính mờ: nền `rgba` trắng/đen trong suốt + `backdrop-filter: blur(24px) saturate(160%)`, bo góc 22px, viền mảnh sáng. Chữ trắng, đổ bóng nhẹ.
- Theo chế độ sáng/tối của hệ thống.
- Trang: container cuộn ngang `scroll-snap`; lăn chuột ngang/vuốt touchpad đổi trang; bấm chấm để nhảy trang. Trang trống cuối tự xóa khi thoát chỉnh sửa; khi kéo icon tới mép phải thì có trang mới.
- Icon link: favicon 64px trong ô vuông bo góc nền trắng mờ, tên bên dưới. Không lấy được favicon → chữ cái đầu trên nền màu sinh từ tên miền.

## Hành vi
- **Thêm link**: nút "+" (dock hoặc lưới khi chỉnh sửa) mở `<dialog>`: URL (bắt buộc, tự thêm `https://` nếu thiếu, chỉ chấp nhận http/https) + Tên (mặc định = tên miền). Chọn nơi đặt: Dock / Trang hiện tại.
- **Sửa link**: khi chỉnh sửa, bấm icon → dialog sửa.
- **Xóa**: nút × ở chế độ chỉnh sửa. Widget Ghi chú/Todo có nội dung → hỏi xác nhận trước khi xóa.
- **Kéo thả**: SortableJS, kéo trong một trang, giữa các trang, và giữa trang ↔ dock (dock chỉ nhận link, không nhận widget). Chỉ bật khi chỉnh sửa.
- **Mở link**: bấm thường mở ở tab hiện tại; Ctrl/giữa chuột mở tab mới (hành vi mặc định của `<a>`).
- **Tìm kiếm**: form GET tới Google (đổi được sang Bing/DuckDuckGo trong ⚙).
- **Ghi chú**: `<textarea>`, tự lưu sau 500ms ngừng gõ.
- **Todo**: ô nhập + Enter để thêm, checkbox, nút xóa từng mục, mục đã xong xuống dưới, gạch ngang.
- **Ngày/giờ**: định dạng `vi-VN`, đồng hồ kim vẽ bằng CSS/SVG, cập nhật mỗi giây.
- **⚙ Cài đặt** (bảng trượt kính mờ): đổi ảnh nền (tải file / URL / mặc định), độ mờ & độ tối lớp phủ nền, bật/tắt thanh tìm kiếm, công cụ tìm kiếm, Xuất JSON, Nhập JSON.

## Dữ liệu
`chrome.storage.local`, một khóa `state`:
```js
{
  version: 1,
  pages: [[ {id, type:'link', url, title} | {id, type:'widget', kind:'clock'|'date'|'note'|'todo', w, h} ]],
  dock:  [ {id, type:'link', url, title} ],
  notes: { [widgetId]: "text" },
  todos: { [widgetId]: [ {id, text, done} ] },
  settings: { search: true, engine: 'google', dim: 0.2, blur: 0 }
}
```
Ảnh nền: IndexedDB, store `wallpaper`, key `current` → `Blob` hoặc `{url}`.
Lần đầu cài: trang 1 có Đồng hồ, Ngày, Todo, Ghi chú; dock có vài link phổ biến; nền gradient mặc định.

**Nhập JSON** là điểm nhận dữ liệu không tin cậy: kiểm tra cấu trúc & kiểu, chỉ giữ link http/https, bỏ trường lạ; file sai → báo lỗi, **không** ghi đè dữ liệu hiện có. Xuất JSON không gồm ảnh nền tải lên (chỉ gồm URL nếu nền là URL).

## Tệp
```
manifest.json      newtab override, quyền: storage, unlimitedStorage, favicon
newtab.html
style.css
app.js             trạng thái, render lưới/dock, chỉnh sửa, cài đặt
widgets.js         đồng hồ, ngày, ghi chú, todo
lib/Sortable.min.js   (bản cố định, lưu trong repo)
test/validate.test.js kiểm tra hàm validate khi nhập JSON (node, assert)
```

## Để người làm tự quyết
Màu sắc/đổ bóng cụ thể, gradient nền mặc định, danh sách link mặc định, hiệu ứng chuyển động (rung, mở dialog), cách chia nhỏ hàm.
