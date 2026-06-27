# Tài liệu hệ thống SiteChat RAG

## 1. Giới thiệu

SiteChat là chatbot tư vấn được xây dựng theo kiến trúc RAG (Retrieval-Augmented Generation). Hệ thống thu thập nội dung từ website, chuyển nội dung thành vector để tìm kiếm theo ngữ nghĩa, sau đó cung cấp phần dữ liệu liên quan cho mô hình ngôn ngữ tạo câu trả lời.

Mục tiêu chính của hệ thống:

- Trả lời dựa trên dữ liệu thật của từng website.
- Hỗ trợ tốt nội dung tiếng Việt, tên hãng và mã sản phẩm.
- Hạn chế mô hình tự suy đoán khi dữ liệu không đầy đủ.
- Cho phép quản trị viên huấn luyện các câu trả lời cố định bằng Trained Q&A.
- Cung cấp widget JavaScript để nhúng chatbot vào WordPress hoặc website khác.

Kiến trúc triển khai hiện tại:

```text
Website cần thu thập dữ liệu
          |
          v
      Web Crawler
          |
          v
 Làm sạch và chia nội dung
          |
          v
 BGE-M3 tạo embedding
          |
          v
       FAISS Index
          |
          |                         Trained Q&A
          |                              |
          +------------+-----------------+
                       |
Người dùng -> Widget -> FastAPI -> RAG Engine -> Groq/Qwen3
                       |
                       v
                    MongoDB
```

## 2. Các thành phần chính

### 2.1. FastAPI

FastAPI cung cấp API cho:

- Đăng nhập và quản lý người dùng.
- Quản lý website.
- Crawl và lập chỉ mục dữ liệu.
- Gửi câu hỏi tới chatbot.
- Lưu và xem lịch sử hội thoại.
- Quản lý Trained Q&A.
- Quản lý lead và chuyển tiếp tới nhân viên.
- Cung cấp cấu hình và file JavaScript cho widget.

### 2.2. MongoDB

MongoDB lưu dữ liệu nghiệp vụ:

- Tài khoản và phân quyền.
- Danh sách website và `site_id`.
- Cấu hình giao diện widget.
- Trained Q&A.
- Phiên hội thoại và tin nhắn.
- Trạng thái các lần crawl.
- Lead, handoff và lịch làm việc của nhân viên.
- Metadata của các trang đã crawl.

MongoDB không đảm nhiệm tìm kiếm vector trong kiến trúc hiện tại.

### 2.3. BGE-M3

`BAAI/bge-m3` là model embedding đa ngôn ngữ chạy cục bộ trên máy chủ. Model nhận một đoạn văn bản và chuyển nó thành vector 1024 chiều.

Model được sử dụng cho hai tác vụ:

1. Chuyển các chunk của website thành vector khi crawl.
2. Chuyển câu hỏi của người dùng thành vector khi tìm kiếm.

### 2.4. FAISS

FAISS lưu vector và thực hiện tìm kiếm vector gần nhất. Ngoài vector, mỗi phần tử còn giữ nội dung chunk và metadata như URL, tiêu đề và `site_id`.

FAISS được lưu trên ổ đĩa tại:

```text
backend/data/chroma_db/faiss_index_baai_bge_m3/
```

Tên model được đưa vào tên thư mục index để tránh mở nhầm index được tạo bởi model embedding khác.

### 2.5. Groq và Qwen3

Hệ thống gọi Groq qua API tương thích OpenAI:

```text
https://api.groq.com/openai/v1/chat/completions
```

Model ngôn ngữ hiện tại:

```text
qwen/qwen3-32b
```

Groq/Qwen3 không tự đọc toàn bộ website và không trực tiếp tìm kiếm trong FAISS. Model chỉ nhận câu hỏi, lịch sử hội thoại và các đoạn dữ liệu đã được RAG chọn.

### 2.6. JavaScript Widget

Widget là giao diện chatbot được nhúng vào website khách hàng. Widget tải cấu hình theo `site_id`, gửi câu hỏi tới FastAPI và hiển thị câu trả lời, nguồn tham khảo hoặc trạng thái kết nối nhân viên.

## 3. Luồng thu thập và xử lý dữ liệu

## 3.1. Crawl website

Khi quản trị viên tạo website hoặc bắt đầu một crawl job:

1. Crawler nhận URL gốc.
2. Crawler tải HTML của trang.
3. Nội dung HTML được phân tích và chuyển thành văn bản.
4. Crawler tìm các liên kết nội bộ để tiếp tục thu thập.
5. Mỗi trang được lưu dưới dạng:

```text
URL
Tiêu đề
Nội dung văn bản
Metadata
```

Số trang tối đa được giới hạn bằng `MAX_PAGES`. Với website demo dưới 100 trang, toàn bộ dữ liệu có thể được xử lý trên một máy chủ.

Các website phụ thuộc hoàn toàn vào JavaScript phía trình duyệt hoặc có cơ chế chống bot có thể không được crawler đọc đầy đủ.

## 3.2. Chia nội dung thành chunk

Một trang sản phẩm có thể dài hơn giới hạn phù hợp cho tìm kiếm. Vì vậy nội dung được chia thành các đoạn nhỏ gọi là chunk.

Cấu hình hiện tại:

```env
CHUNK_SIZE=700
CHUNK_OVERLAP=120
```

- `CHUNK_SIZE=700`: mỗi chunk dài khoảng 700 ký tự.
- `CHUNK_OVERLAP=120`: hai chunk liền nhau chia sẻ khoảng 120 ký tự.

Overlap giúp thông tin nằm tại ranh giới giữa hai chunk không bị cắt rời hoàn toàn.

Ví dụ:

```text
Chunk 1: ... khóa hỗ trợ vân tay, mật khẩu và thẻ từ. Sản phẩm phù hợp...
Chunk 2: Sản phẩm phù hợp cho cửa nhôm Xingfa, độ dày cửa từ...
```

Tiêu đề trang được chèn vào từng chunk khi tiêu đề chưa xuất hiện ở đầu đoạn:

```text
Khóa thông minh cổng sắt C114

Sản phẩm hỗ trợ mở khóa bằng vân tay, mật khẩu...
```

Việc lặp lại tiêu đề giúp model embedding nhận biết chunk đang nói về sản phẩm nào, đặc biệt khi tên hoặc mã sản phẩm chỉ xuất hiện trong heading của trang.

Mỗi chunk có metadata:

```json
{
  "site_id": "dd3e2142f3a8",
  "url": "https://example.com/san-pham/c114",
  "title": "Khóa thông minh C114",
  "chunk_index": 0,
  "total_chunks": 4,
  "source": "https://example.com/san-pham/c114",
  "word_count": 96
}
```

`site_id` là thông tin quan trọng để chatbot của website này không lấy dữ liệu từ website khác.

## 4. Model embedding hiểu dữ liệu như thế nào?

## 4.1. Embedding không phải là câu trả lời

BGE-M3 không đọc chunk rồi viết câu trả lời như một chatbot. Nhiệm vụ của model embedding là biểu diễn ý nghĩa của văn bản bằng một dãy số.

Ví dụ đơn giản:

```text
"Khóa cửa mở bằng vân tay"
          |
          v
[0.021, -0.183, 0.076, ..., 0.114]
```

Vector thực tế của BGE-M3 có 1024 giá trị. Mỗi giá trị riêng lẻ không mang một ý nghĩa dễ đọc như “khóa”, “cửa” hay “vân tay”. Ý nghĩa được phân bố trên toàn bộ vector.

Trong quá trình huấn luyện, model học cách đặt các văn bản có nội dung tương tự ở gần nhau trong không gian vector.

Ví dụ:

```text
"Khóa cửa mở bằng vân tay"
"Loại khóa nào hỗ trợ nhận diện ngón tay?"
```

Hai câu dùng từ ngữ khác nhau nhưng có ý nghĩa gần nhau, vì vậy vector của chúng thường nằm gần nhau.

Trong khi đó:

```text
"Bản lề sàn chịu tải 150 kg"
```

có ý nghĩa khác nên vector thường nằm xa hơn.

## 4.2. Xử lý tiếng Việt

BGE-M3 là model đa ngôn ngữ. Model có thể biểu diễn:

- Câu hỏi tiếng Việt tự nhiên.
- Nội dung pha trộn tiếng Việt và tiếng Anh.
- Tên thương hiệu.
- Thuật ngữ kỹ thuật.
- Một phần mã và tên sản phẩm.

Ví dụ:

```text
"khóa cửa nhôm chống nước"
"khóa smart lock lắp ngoài trời"
```

Semantic search có khả năng nhận ra hai câu cùng liên quan đến khóa thông minh dùng trong môi trường ngoài trời, dù không trùng hoàn toàn từ khóa.

Tuy nhiên embedding không phải lúc nào cũng xử lý tốt chuỗi định danh như:

```text
C114
AO11303
CO1148
HUAVY
```

Vì vậy hệ thống bổ sung keyword search để tìm chính xác các mã này.

## 4.3. Chuẩn hóa vector

Embedding được tạo với:

```python
normalize_embeddings=True
```

Sau chuẩn hóa, vector có độ dài bằng 1. Việc này giúp khoảng cách giữa các vector ổn định hơn và cho phép FAISS so sánh mức tương đồng giữa câu hỏi và chunk.

Model chạy bằng CPU:

```env
EMBEDDINGS_DEVICE=cpu
EMBEDDINGS_BATCH_SIZE=8
```

Batch size 8 nghĩa là khi crawl, hệ thống có thể xử lý nhiều đoạn văn bản trong một lượt thay vì từng chunk riêng lẻ.

## 4.4. Lưu embedding vào FAISS

Sau khi BGE-M3 tạo vector:

```text
Chunk + Metadata + Vector
             |
             v
          FAISS
```

FAISS lưu vector để không phải embedding lại toàn bộ website ở mỗi câu hỏi.

Khi người dùng gửi câu hỏi, chỉ câu hỏi mới được embedding. Vector câu hỏi được so sánh với các vector chunk đã có trong FAISS.

Khi crawl lại cùng URL:

1. Hệ thống tìm và xóa các chunk cũ của URL.
2. Nội dung trang được tải lại.
3. Nội dung được chia chunk lại.
4. BGE-M3 tạo embedding mới.
5. Các vector mới được ghi vào FAISS.

Nhờ đó dữ liệu của cùng một trang không bị nhân bản sau mỗi lần crawl.

## 5. RAG hoạt động như thế nào?

RAG tách quá trình trả lời thành hai bước:

1. Retrieval: tìm dữ liệu liên quan.
2. Generation: dùng dữ liệu tìm được để tạo câu trả lời.

```text
Câu hỏi
   |
   v
Retrieval ------------------+
   |                        |
   v                        |
Các chunk liên quan         |
   |                        |
   +----> Prompt ----> LLM -+
                         |
                         v
                    Câu trả lời
```

Nếu không có Retrieval, model ngôn ngữ chỉ dựa vào kiến thức được huấn luyện trước và có thể không biết thông tin riêng của doanh nghiệp.

## 5.1. Nhận câu hỏi từ widget

Widget gửi request:

```http
POST /api/chat
Content-Type: application/json
```

```json
{
  "message": "Khóa C114 dùng cho loại cửa nào?",
  "session_id": "widget-abc123",
  "site_id": "dd3e2142f3a8"
}
```

Backend dùng `site_id` để:

- Xác định website.
- Đọc tên và URL website.
- Lọc dữ liệu retrieval.
- Lưu hội thoại đúng website.

## 5.2. Kiểm tra Trained Q&A

Trained Q&A được kiểm tra trước RAG thông thường.

Ví dụ:

```text
Câu hỏi huấn luyện: "Tên đầy đủ của công ty là gì?"
Câu trả lời: "Công ty Cổ phần Euro Door Hardware..."
```

Câu hỏi huấn luyện cũng được embedding. Khi người dùng đặt câu hỏi, hệ thống tính cosine similarity giữa vector câu hỏi mới và các câu hỏi đã huấn luyện.

Ngưỡng hiện tại:

```python
QA_MATCH_THRESHOLD = 0.85
```

Nếu điểm tương đồng đạt ngưỡng:

1. Trả trực tiếp câu trả lời đã huấn luyện.
2. Không thực hiện retrieval từ tài liệu.
3. Không gọi Groq để viết lại câu trả lời.
4. Không hiển thị source `Trained Q&A Response`.
5. Tăng số lần sử dụng của Q&A.
6. Lưu câu hỏi và câu trả lời vào MongoDB.

Nhánh này phù hợp với các thông tin cần trả lời chính xác và nhất quán.

## 5.3. Viết lại câu hỏi theo hội thoại

Nếu không khớp Trained Q&A, hệ thống đọc lịch sử hội thoại gần nhất.

Ví dụ:

```text
Người dùng: Khóa C114 dùng cho cửa nào?
Chatbot: Sản phẩm phù hợp với...
Người dùng: Còn màu sắc thì sao?
```

Nếu tìm trực tiếp câu “Còn màu sắc thì sao?”, retrieval không biết người dùng đang hỏi sản phẩm nào.

Query rewriting chuyển câu hỏi thành dạng độc lập:

```text
Khóa C114 có những màu sắc nào?
```

Query đã viết lại chỉ dùng để tìm kiếm. Câu hỏi gốc vẫn được đưa vào prompt và lưu trong lịch sử.

## 5.4. Hybrid search

Hệ thống kết hợp dense semantic search và lexical keyword search.

### Dense semantic search

Quy trình:

```text
Câu hỏi đã viết lại
          |
          v
       BGE-M3
          |
          v
   Vector câu hỏi
          |
          v
 FAISS tìm vector gần nhất
```

Dense search phù hợp với câu hỏi diễn đạt tự nhiên:

```text
"Tôi cần khóa lắp ngoài trời và chịu được mưa"
```

Nó có thể tìm được chunk nói về “khả năng chống nước” dù câu hỏi và tài liệu không dùng hoàn toàn cùng từ.

### Lexical keyword search

Hệ thống đồng thời tách từ câu hỏi và nội dung để tính điểm kiểu BM25.

Keyword search quan tâm trực tiếp tới:

- Từ khóa xuất hiện trong nội dung.
- Mã sản phẩm.
- Tên hãng.
- Tiêu đề trang.
- Mức độ hiếm của từ trong toàn bộ tập dữ liệu.

Nếu toàn bộ câu hỏi xuất hiện trong tiêu đề, tài liệu được cộng thêm điểm.

Lexical search phù hợp với:

```text
"C114"
"keo HUAVY"
"AO11303"
```

### Hợp nhất hai danh sách

Hai danh sách được hợp nhất bằng Reciprocal Rank Fusion. Tài liệu được xếp hạng tốt ở cả semantic search và keyword search sẽ được ưu tiên.

Trọng số:

```env
RAG_DENSE_WEIGHT=0.65
RAG_KEYWORD_WEIGHT=0.35
```

Semantic search chiếm 65% và keyword search chiếm 35%.

Với website nhỏ, hệ thống có thể quét tối đa:

```env
RAG_MAX_CANDIDATES=2000
```

Điều này cho phép lọc đúng `site_id` trước khi chọn kết quả cuối cùng.

## 5.5. Lọc và chấm điểm tài liệu

Sau hybrid search, hệ thống loại các chunk không đủ liên quan.

Các tín hiệu được sử dụng:

- Dense distance từ BGE-M3/FAISS.
- Keyword score.
- Tỷ lệ từ trong câu hỏi xuất hiện ở tiêu đề hoặc nội dung.
- `site_id` và URL website.

Cấu hình khoảng cách dense:

```env
RAG_MAX_DENSE_DISTANCE=1.25
```

Khoảng cách càng thấp thì vector càng gần nhau. Chunk có keyword match vẫn có thể được giữ lại ngay cả khi semantic distance chưa tốt, điều này hữu ích cho mã sản phẩm.

Hệ thống lấy tối đa bốn chunk cuối:

```env
RETRIEVAL_K=4
RAG_RETRIEVAL_OVERSAMPLE=3
```

Oversample 3 nghĩa là retrieval có thể lấy tối đa 12 ứng viên để xếp hạng và lọc trước khi trả bốn kết quả tốt nhất.

## 5.6. Xây dựng context

Các chunk đã chọn được ghép thành context:

```text
[Source: Khóa thông minh C114]
Nội dung chunk thứ nhất...

---

[Source: Phụ kiện cửa nhôm Xingfa]
Nội dung chunk thứ hai...
```

Mỗi chunk được giới hạn:

```env
RAG_CONTEXT_CHUNK_MAX_CHARS=800
```

Giới hạn giúp prompt không quá dài và giảm thời gian gọi LLM.

Danh sách source được tạo từ metadata:

```json
{
  "url": "https://example.com/san-pham/c114",
  "title": "Khóa thông minh C114",
  "content_preview": "Nội dung...",
  "relevance_score": 0.86
}
```

Các source trùng URL được loại bớt trước khi gửi tới giao diện.

## 5.7. Tạo prompt

Prompt gửi tới Groq gồm:

1. System prompt quy định vai trò chatbot.
2. Lịch sử hội thoại gần nhất.
3. Context lấy từ RAG.
4. Câu hỏi gốc của khách hàng.
5. Quy tắc đầu ra.

Ví dụ rút gọn:

```text
Bạn là chatbot tư vấn bán hàng của Euro Hardware.

[Lịch sử]
User: ...
Assistant: ...

[Thông tin tham khảo]
Các chunk lấy từ FAISS...

[Câu hỏi của khách]
Khóa C114 dùng cho cửa nào?

[Yêu cầu]
- Trả lời bằng tiếng Việt.
- Không hiển thị suy luận nội bộ.
- Không bịa thông tin.
- Nếu thiếu dữ liệu, đề nghị khách để lại số điện thoại/Zalo.
```

Groq/Qwen3 tạo câu trả lời dựa trên prompt này. Vì context đã chứa dữ liệu liên quan, model có thể diễn đạt lại thành câu trả lời tự nhiên.

Điểm cần phân biệt:

- BGE-M3 tìm đoạn dữ liệu có liên quan.
- FAISS lưu và tìm vector.
- Hybrid search xếp hạng tài liệu.
- Qwen3 đọc context và viết câu trả lời.

Không có một model duy nhất làm toàn bộ quá trình.

## 5.8. Tính confidence

Confidence được ước lượng từ:

- Dense distance.
- Việc có keyword match hay không.
- Số lượng chunk được sử dụng.

Confidence là tín hiệu tham khảo của hệ thống, không phải xác suất toán học đảm bảo câu trả lời đúng.

## 5.9. Lưu hội thoại

Sau khi trả lời, MongoDB lưu:

```text
session_id
site_id
role: user/assistant
content
sources
timestamp
```

Lịch sử này được dùng cho:

- Hiển thị hội thoại trong dashboard.
- Query rewriting ở câu hỏi tiếp theo.
- Phân tích source đã sử dụng.
- Chuyển tiếp hội thoại tới nhân viên.

## 6. Các trường hợp trả lời

## 6.1. Khớp Trained Q&A

```text
Câu hỏi
   |
   v
Q&A similarity >= 0.85
   |
   v
Trả câu trả lời huấn luyện
```

Đặc điểm:

- Không gọi Groq.
- Không chạy RAG tài liệu.
- Không hiển thị source.
- Phản hồi nhanh và ổn định.

## 6.2. Có tài liệu RAG phù hợp

```text
Câu hỏi
   |
   v
Hybrid search
   |
   v
Context phù hợp
   |
   v
Groq tạo câu trả lời
```

Đặc điểm:

- Nội dung được tổng hợp từ các trang đã crawl.
- Có thể hiển thị source URL.
- Câu trả lời có thể kết hợp thông tin từ nhiều chunk.

## 6.3. Không có đủ dữ liệu

Nếu retrieval không tìm được context đủ liên quan, prompt yêu cầu chatbot không tự bịa.

Cách trả lời mong muốn:

```text
Hiện tôi chưa có đủ thông tin để trả lời chính xác. Anh/chị vui
lòng để lại số điện thoại hoặc Zalo để nhân viên tư vấn chi tiết.
```

## 6.4. Câu hỏi nối tiếp

Hệ thống dùng lịch sử để viết lại câu hỏi rồi thực hiện retrieval. Điều này giúp chatbot duy trì chủ đề giữa nhiều lượt nói.

## 6.5. Yêu cầu gặp nhân viên

Khi người dùng chọn “Gặp nhân viên”:

1. Widget kiểm tra trạng thái nhân viên.
2. Backend tạo handoff request.
3. Nhân viên có thể tiếp nhận cuộc hội thoại.
4. Tin nhắn tiếp theo được chuyển giữa khách và nhân viên.
5. Nếu không có nhân viên trực tuyến, widget có thể thu thập thông tin liên hệ.

## 6.6. Lỗi dịch vụ bên ngoài

Nếu Groq hoặc mạng gặp lỗi, backend ghi nhận lỗi và API trả trạng thái thất bại. Widget hiển thị thông báo chung thay vì đưa nội dung lỗi kỹ thuật cho khách hàng.

## 7. Kết nối chatbot với website

Widget được nhúng bằng thẻ script:

```html
<script
  src="https://chat.eurohardware.id.vn/widget/chatbot.js"
  data-site-id="dd3e2142f3a8"
  data-api-url="https://chat.eurohardware.id.vn"
  crossorigin="anonymous"
  async>
</script>
```

Ý nghĩa:

- `src`: địa chỉ file JavaScript của widget.
- `data-site-id`: website và tập dữ liệu cần sử dụng.
- `data-api-url`: địa chỉ FastAPI.
- `async`: tải widget mà không chặn quá trình hiển thị website.

Khi khởi tạo, widget gọi:

```http
GET /api/sites/{site_id}/config
```

API trả cấu hình:

- Tiêu đề chatbot.
- Lời chào.
- Màu chủ đạo.
- Vị trí widget.
- Hiển thị source.
- Cấu hình branding.

Khi người dùng gửi tin nhắn:

```http
POST /api/chat
```

Khi người dùng đánh giá câu trả lời hoặc yêu cầu nhân viên, widget gọi các API feedback/handoff tương ứng.

Website nhúng và API phải sử dụng HTTPS. Domain website cần được thêm vào `CORS_ORIGINS` để trình duyệt cho phép widget gọi API.

## 8. Triển khai lên Google Cloud

## 8.1. Cấu hình máy chủ

Cấu hình đang sử dụng:

```text
Google Compute Engine
Machine type: n2-standard-4
CPU: 4 vCPU
RAM: 16 GB
Disk: 50 GB pd-balanced
OS: Ubuntu 22.04 LTS
Region: asia-southeast1
```

Cấu hình này đủ để chạy:

- FastAPI.
- BGE-M3 trên CPU.
- FAISS.
- MongoDB.
- Nginx.
- Crawl website dưới 100 trang.

Groq chạy bên ngoài nên VM không phải chạy model ngôn ngữ 32B.

## 8.2. Luồng truy cập production

```text
Trình duyệt
    |
    | HTTPS :443
    v
  Nginx
    |
    | HTTP nội bộ
    v
FastAPI 127.0.0.1:8000
    |
    +--> MongoDB 127.0.0.1:27017
    +--> BGE-M3 + FAISS
    +--> Groq API qua Internet
```

Chỉ Nginx nhận kết nối trực tiếp từ Internet. FastAPI và MongoDB chỉ lắng nghe trên localhost.

## 8.3. Chuẩn bị VM

Cài các thành phần:

```bash
sudo apt update
sudo apt install -y git curl build-essential python3 python3-venv \
  python3-pip nginx
```

MongoDB được cài như một system service trên cùng VM.

Source code được đặt tại:

```text
/opt/sitechat
```

## 8.4. Cài backend

```bash
cd /opt/sitechat/backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip wheel
pip install -r requirements.txt
```

Tạo các thư mục runtime:

```bash
mkdir -p logs data/chroma_db data/uploads
```

Lần khởi động đầu, Hugging Face tải BGE-M3 về máy. Các lần khởi động sau sử dụng model đã có trong cache.

## 8.5. Cấu hình môi trường

Backend đọc cấu hình từ:

```text
/opt/sitechat/backend/.env
```

Các nhóm cấu hình chính:

```text
Application URL và CORS
MongoDB
Groq/OpenAI-compatible API
BGE-M3
FAISS
Chunking
Retrieval
```

MongoDB chạy cục bộ:

```env
MONGODB_URL=mongodb://sitechat:PASSWORD@127.0.0.1:27017/sitechat?authSource=sitechat
MONGODB_DB=sitechat
```

Embedding và RAG:

```env
EMBEDDINGS_MODEL=BAAI/bge-m3
EMBEDDINGS_DEVICE=cpu
EMBEDDINGS_BATCH_SIZE=8

CHUNK_SIZE=700
CHUNK_OVERLAP=120
RETRIEVAL_K=4
RAG_RETRIEVAL_OVERSAMPLE=3
RAG_HYBRID_SEARCH=true
RAG_DENSE_WEIGHT=0.65
RAG_KEYWORD_WEIGHT=0.35
RAG_MAX_CANDIDATES=2000
RAG_MAX_DENSE_DISTANCE=1.25
RAG_CONTEXT_CHUNK_MAX_CHARS=800
```

## 8.6. Chạy bằng systemd

FastAPI được quản lý bởi `sitechat.service`:

```ini
[Unit]
Description=SiteChat FastAPI
After=network-online.target mongod.service
Requires=mongod.service

[Service]
Type=simple
User=khatranudn
Group=khatranudn
WorkingDirectory=/opt/sitechat/backend
Environment=PYTHONUNBUFFERED=1
ExecStart=/opt/sitechat/backend/.venv/bin/uvicorn app.main:app \
  --host 127.0.0.1 --port 8000 --workers 1
Restart=always
RestartSec=5
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
```

Chỉ dùng một Uvicorn worker vì:

- FAISS được giữ trong bộ nhớ của tiến trình.
- Scheduler chạy trong backend.
- Nhiều worker có thể cùng cập nhật một index FAISS trên ổ đĩa.

Kích hoạt:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sitechat
```

## 8.7. Nginx reverse proxy

Nginx nhận request từ domain và chuyển vào FastAPI:

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name chat.eurohardware.id.vn;
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

Nginx giúp:

- Không công khai trực tiếp port 8000.
- Cung cấp HTTPS.
- Chuyển tiếp IP và protocol gốc tới FastAPI.
- Cho phép tăng giới hạn upload tài liệu.

## 8.8. Domain và HTTPS

DNS tạo bản ghi:

```text
Type: A
Name: chat
Value: IP tĩnh của VM
```

Sau khi DNS trỏ đúng, Certbot tạo chứng chỉ:

```bash
sudo certbot --nginx -d chat.eurohardware.id.vn
```

Domain production:

```text
https://chat.eurohardware.id.vn
```

Widget và `data-api-url` đều phải dùng HTTPS để tránh lỗi mixed content trên WordPress.

## 8.9. Cập nhật phiên bản

Code được cập nhật qua Git:

```bash
cd /opt/sitechat
git pull --ff-only
```

Nếu backend thay đổi:

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart sitechat
```

Nếu chỉ thay đổi widget và file build đã được commit, VM không cần chạy `npm run build`.

Các dữ liệu runtime không nên được Git theo dõi:

```text
backend/.env
backend/data/chroma_db/
backend/data/uploads/
backend/logs/
```

Do đó `git pull` không thay đổi MongoDB, FAISS BGE-M3 hoặc cấu hình production.

## 9. Khi nào cần crawl lại?

Không cần crawl lại khi chỉ thay đổi:

- Giao diện dashboard.
- Giao diện widget.
- Nội dung tiếng Việt trên widget.
- Prompt.
- Logic hiển thị source.
- Model Groq dùng để sinh câu trả lời.

Cần crawl lại khi thay đổi:

- Model embedding.
- Kích thước hoặc overlap của chunk.
- Cách làm sạch nội dung.
- Metadata dùng cho retrieval.
- Logic tạo nội dung trước khi embedding.

Khi đổi model embedding, toàn bộ vector cũ không còn cùng không gian vector với model mới. Vì vậy phải tạo index mới và embedding lại dữ liệu.

## 10. Tóm tắt

SiteChat sử dụng hai loại AI model với vai trò khác nhau:

```text
BGE-M3
  -> Biến văn bản thành vector
  -> Tìm dữ liệu có ý nghĩa gần câu hỏi

Qwen3 qua Groq
  -> Đọc câu hỏi và context
  -> Viết câu trả lời tiếng Việt tự nhiên
```

RAG không làm cho model ghi nhớ toàn bộ website. Thay vào đó, hệ thống:

1. Chuẩn bị và embedding dữ liệu trước.
2. Tìm một số đoạn liên quan ở thời điểm người dùng hỏi.
3. Đưa các đoạn đó vào prompt.
4. Yêu cầu LLM trả lời dựa trên dữ liệu tìm được.

Hybrid search bổ sung khả năng tìm kiếm mã sản phẩm chính xác bên cạnh semantic search. Trained Q&A được ưu tiên cho những câu trả lời cần cố định. MongoDB lưu dữ liệu nghiệp vụ, còn FAISS lưu vector phục vụ retrieval.

Sau khi triển khai, chatbot được cung cấp qua Nginx/HTTPS và nhúng vào website bằng một thẻ JavaScript chứa `site_id`.
