// UI strings (vi / en). t(key, vars) interpolates {name}. DOM: data-i18n (text),
// data-i18n-ph (placeholder), data-i18n-title (title), data-i18n-aria (aria-label).
export const STRINGS = {
  vi: {
    'tab.title': 'Tab mới',
    'search.ph': 'Tìm kiếm trên web', 'search.aria': 'Tìm kiếm',
    'add': 'Thêm', 'edit.title': 'Chỉnh sửa màn hình', 'edit.aria': 'Chỉnh sửa', 'done': 'Xong',
    'settings': 'Cài đặt', 'dock.add': 'Thêm vào dock', 'pages': 'Trang', 'page.n': 'Trang {n}',
    'cancel': 'Hủy', 'save': 'Lưu', 'close': 'Đóng', 'del': 'Xóa',

    'link.add': 'Thêm lối tắt', 'link.edit': 'Sửa lối tắt',
    'link.url': 'Địa chỉ', 'link.url.ph': 'vd: youtube.com',
    'link.name': 'Tên', 'link.name.ph': 'Tự lấy theo tên miền',
    'link.bg': 'Nền ô', 'bg.auto': 'Tự động', 'bg.light': 'Sáng', 'bg.dark': 'Tối', 'bg.custom': 'Màu…', 'bg.color': 'Màu nền ô',
    'link.icon': 'Icon riêng', 'link.icon.ph': 'Link ảnh (tùy chọn)',
    'link.upload': 'Tải ảnh lên', 'link.favicon': 'Dùng favicon',
    'link.place': 'Đặt ở', 'place.page': 'Trang hiện tại', 'place.dock': 'Dock',

    'addDlg.title': 'Thêm vào màn hình', 'add.link': 'Lối tắt', 'add.clock': 'Đồng hồ', 'add.date': 'Ngày',
    'add.todo': 'Việc cần làm', 'add.note4': 'Ghi chú (lớn)', 'add.note2': 'Ghi chú (nhỏ)',
    'add.weather2': 'Thời tiết (nhỏ)', 'add.weather4': 'Thời tiết (lớn)',

    'folder.default': 'Thư mục', 'folder.name': 'Tên thư mục',
    'confirm.folder': 'Xóa thư mục "{name}" cùng {n} lối tắt bên trong?',
    'confirm.widget': 'Widget này vẫn còn nội dung. Xóa luôn?',

    'set.wall': 'Ảnh nền', 'wall.file': 'Chọn ảnh từ máy', 'wall.daily': 'Ảnh Bing mỗi ngày', 'wall.reset': 'Mặc định',
    'wall.url.ph': 'Hoặc dán link ảnh (https://…)', 'wall.use': 'Dùng', 'wall.dim': 'Làm tối nền', 'wall.blur': 'Làm mờ nền',
    'set.search': 'Tìm kiếm', 'search.show': 'Hiện thanh tìm kiếm', 'search.engine': 'Công cụ',
    'set.lang': 'Ngôn ngữ',
    'set.backup': 'Sao lưu', 'backup.export': 'Xuất file JSON', 'backup.import': 'Nhập file JSON',
    'backup.hint': 'Ảnh nền và icon tải từ máy không nằm trong file sao lưu.',

    'err.notImage': 'File này không phải ảnh.', 'err.url': 'Địa chỉ không hợp lệ (chỉ hỗ trợ http/https).',
    'err.iconUrl': 'Link ảnh icon không hợp lệ.',
    'msg.wallChanged': 'Đã đổi ảnh nền.', 'msg.wallUrlFail': 'Không tải được ảnh từ link này.',
    'msg.wallReset': 'Đã về nền mặc định.', 'msg.wallDaily': 'Ảnh nền sẽ tự đổi mỗi ngày.',
    'msg.bingFail': 'Không tải được ảnh Bing, thử lại sau.', 'msg.exported': 'Đã xuất file sao lưu.',
    'msg.tooBig': 'File quá lớn (tối đa 5MB).', 'msg.importFail': 'Không nhập được: {reason}',
    'import.notJson': 'file không phải JSON hợp lệ.', 'import.badFormat': 'file không đúng định dạng Mono New Tab.',
    'confirm.import': 'Thay toàn bộ màn hình hiện tại bằng dữ liệu trong file?', 'msg.imported': 'Đã khôi phục từ file sao lưu.',

    'date.month': 'Tháng {m}, {y}',
    'note.title': 'Ghi chú', 'note.ph': 'Viết gì đó…',
    'todo.title': 'Việc cần làm · {n}', 'todo.ph': '+ Thêm việc',

    'wx.title': 'Thời tiết', 'wx.city.ph': 'Nhập thành phố…', 'wx.searching': 'Đang tìm…', 'wx.notFound': 'Không tìm thấy.',
    'wx.netErr': 'Lỗi mạng, thử lại sau.', 'wx.change': 'Đổi thành phố', 'wx.today': 'Nay', 'wx.loading': 'Đang tải…',
    'wx.retry': 'Thử lại', 'wx.loadFail': 'Không tải được thời tiết. ', 'wx.range': 'C:{max}  T:{min}',
    'wx.clear': 'Trời quang', 'wx.few': 'Ít mây', 'wx.partly': 'Có mây', 'wx.overcast': 'Nhiều mây', 'wx.fog': 'Sương mù',
    'wx.drizzle': 'Mưa phùn', 'wx.rain': 'Mưa', 'wx.heavyRain': 'Mưa to', 'wx.snow': 'Tuyết', 'wx.showers': 'Mưa rào',
    'wx.snowShowers': 'Mưa tuyết', 'wx.storm': 'Dông', 'wx.hail': 'Dông kèm mưa đá', 'wx.unknown': 'Không rõ',
  },
  en: {
    'tab.title': 'New Tab',
    'search.ph': 'Search the web', 'search.aria': 'Search',
    'add': 'Add', 'edit.title': 'Edit home screen', 'edit.aria': 'Edit', 'done': 'Done',
    'settings': 'Settings', 'dock.add': 'Add to dock', 'pages': 'Pages', 'page.n': 'Page {n}',
    'cancel': 'Cancel', 'save': 'Save', 'close': 'Close', 'del': 'Delete',

    'link.add': 'Add shortcut', 'link.edit': 'Edit shortcut',
    'link.url': 'Address', 'link.url.ph': 'e.g. youtube.com',
    'link.name': 'Name', 'link.name.ph': 'Defaults to the domain',
    'link.bg': 'Tile background', 'bg.auto': 'Auto', 'bg.light': 'Light', 'bg.dark': 'Dark', 'bg.custom': 'Colour…', 'bg.color': 'Tile colour',
    'link.icon': 'Custom icon', 'link.icon.ph': 'Image link (optional)',
    'link.upload': 'Upload image', 'link.favicon': 'Use favicon',
    'link.place': 'Place in', 'place.page': 'Current page', 'place.dock': 'Dock',

    'addDlg.title': 'Add to home screen', 'add.link': 'Shortcut', 'add.clock': 'Clock', 'add.date': 'Date',
    'add.todo': 'To-do', 'add.note4': 'Note (large)', 'add.note2': 'Note (small)',
    'add.weather2': 'Weather (small)', 'add.weather4': 'Weather (large)',

    'folder.default': 'Folder', 'folder.name': 'Folder name',
    'confirm.folder': 'Delete folder "{name}" and the {n} shortcuts inside?',
    'confirm.widget': 'This widget still has content. Delete it?',

    'set.wall': 'Wallpaper', 'wall.file': 'Choose image', 'wall.daily': 'Daily Bing image', 'wall.reset': 'Default',
    'wall.url.ph': 'Or paste an image link (https://…)', 'wall.use': 'Use', 'wall.dim': 'Darken', 'wall.blur': 'Blur',
    'set.search': 'Search', 'search.show': 'Show search bar', 'search.engine': 'Engine',
    'set.lang': 'Language',
    'set.backup': 'Backup', 'backup.export': 'Export JSON', 'backup.import': 'Import JSON',
    'backup.hint': "Uploaded wallpapers and icons aren't included in backups.",

    'err.notImage': "That file isn't an image.", 'err.url': 'Invalid address (http/https only).',
    'err.iconUrl': 'Invalid icon image link.',
    'msg.wallChanged': 'Wallpaper changed.', 'msg.wallUrlFail': "Couldn't load an image from that link.",
    'msg.wallReset': 'Back to the default wallpaper.', 'msg.wallDaily': 'The wallpaper will change every day.',
    'msg.bingFail': "Couldn't load the Bing image, try again later.", 'msg.exported': 'Backup exported.',
    'msg.tooBig': 'File too large (max 5 MB).', 'msg.importFail': 'Import failed: {reason}',
    'import.notJson': 'not a valid JSON file.', 'import.badFormat': 'not a Mono New Tab backup.',
    'confirm.import': 'Replace your whole home screen with this file?', 'msg.imported': 'Restored from backup.',

    'date.month': '{month} {y}',
    'note.title': 'Note', 'note.ph': 'Write something…',
    'todo.title': 'To-do · {n}', 'todo.ph': '+ Add task',

    'wx.title': 'Weather', 'wx.city.ph': 'Enter a city…', 'wx.searching': 'Searching…', 'wx.notFound': 'No results.',
    'wx.netErr': 'Network error, try again later.', 'wx.change': 'Change city', 'wx.today': 'Today', 'wx.loading': 'Loading…',
    'wx.retry': 'Retry', 'wx.loadFail': "Couldn't load the weather. ", 'wx.range': 'H:{max}  L:{min}',
    'wx.clear': 'Clear', 'wx.few': 'Mostly clear', 'wx.partly': 'Partly cloudy', 'wx.overcast': 'Overcast', 'wx.fog': 'Fog',
    'wx.drizzle': 'Drizzle', 'wx.rain': 'Rain', 'wx.heavyRain': 'Heavy rain', 'wx.snow': 'Snow', 'wx.showers': 'Showers',
    'wx.snowShowers': 'Snow showers', 'wx.storm': 'Thunderstorm', 'wx.hail': 'Thunderstorm with hail', 'wx.unknown': 'Unknown',
  },
};
export const LANGS = Object.keys(STRINGS);

let lang = 'vi';
export const getLang = () => lang;
export const setLang = l => { lang = STRINGS[l] ? l : 'vi'; };
export const locale = () => (lang === 'vi' ? 'vi-VN' : 'en-US');
export const browserLang = () => (globalThis.navigator?.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en');

export const t = (key, vars = {}) =>
  (STRINGS[lang][key] ?? STRINGS.vi[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

export function translateDom(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}
