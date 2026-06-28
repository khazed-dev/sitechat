(function () {
    "use strict";

    const state = { page: 1, perPage: 12, search: "", totalPages: 0 };
    const elements = {
        form: document.getElementById("search-form"),
        search: document.getElementById("search-input"),
        status: document.getElementById("status"),
        grid: document.getElementById("data-grid"),
        pagination: document.getElementById("pagination"),
        previous: document.getElementById("previous-page"),
        next: document.getElementById("next-page"),
        pageLabel: document.getElementById("page-label"),
        summary: document.getElementById("result-summary"),
        pageCount: document.getElementById("page-count"),
        chunkCount: document.getElementById("chunk-count"),
        modelName: document.getElementById("model-name"),
        dialog: document.getElementById("chunk-dialog"),
        closeDialog: document.getElementById("close-dialog"),
        dialogTitle: document.getElementById("dialog-title"),
        dialogUrl: document.getElementById("dialog-url"),
        dialogStatus: document.getElementById("dialog-status"),
        chunkList: document.getElementById("chunk-list")
    };

    const number = new Intl.NumberFormat("vi-VN");
    const date = new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short"
    });

    function setStatus(message, kind) {
        elements.status.textContent = message;
        elements.status.className = "status" + (kind ? " status-" + kind : "");
        elements.status.hidden = false;
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function renderPageCard(item) {
        const card = createElement("article", "data-card");
        const heading = createElement("h3", "card-title", item.title);
        const link = createElement("a", "card-url", item.url);
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        const preview = createElement(
            "p",
            "card-preview",
            item.content_preview || "Trang này chưa có nội dung xem trước."
        );

        const metadata = createElement("div", "card-metadata");
        metadata.append(
            createElement("span", "", number.format(item.chunk_count) + " chunk"),
            createElement(
                "span",
                "",
                item.last_crawled
                    ? "Crawl " + date.format(new Date(item.last_crawled))
                    : "Chưa có thời gian crawl"
            )
        );

        const button = createElement("button", "detail-button", "Xem các chunk");
        button.type = "button";
        button.addEventListener("click", function () {
            openChunks(item);
        });

        card.append(heading, link, preview, metadata, button);
        return card;
    }

    function render(data) {
        elements.grid.replaceChildren();
        data.items.forEach(function (item) {
            elements.grid.appendChild(renderPageCard(item));
        });

        state.totalPages = data.pagination.total_pages;
        elements.pageCount.textContent = number.format(data.stats.indexed_pages);
        elements.chunkCount.textContent = number.format(data.stats.vector_chunks);
        elements.modelName.textContent = data.stats.embedding_model;
        elements.summary.textContent = data.pagination.total_items
            ? number.format(data.pagination.total_items) + " kết quả"
            : "Không có kết quả";

        if (!data.items.length) {
            setStatus(
                state.search
                    ? "Không tìm thấy dữ liệu phù hợp với từ khóa."
                    : "Chưa có trang nào được lập chỉ mục.",
                "empty"
            );
            elements.grid.hidden = true;
        } else {
            elements.status.hidden = true;
            elements.grid.hidden = false;
        }

        elements.pageLabel.textContent =
            "Trang " + data.pagination.page + " / " + Math.max(1, state.totalPages);
        elements.previous.disabled = state.page <= 1;
        elements.next.disabled = state.page >= state.totalPages;
        elements.pagination.hidden = state.totalPages <= 1;
    }

    async function loadData() {
        setStatus("Đang tải dữ liệu…");
        elements.grid.hidden = true;
        elements.pagination.hidden = true;

        const params = new URLSearchParams({
            page: String(state.page),
            per_page: String(state.perPage)
        });
        if (state.search) params.set("search", state.search);

        try {
            const response = await fetch("/api/public/data?" + params.toString(), {
                headers: { Accept: "application/json" }
            });
            if (!response.ok) throw new Error("HTTP " + response.status);
            render(await response.json());
        } catch (error) {
            console.error("Không thể tải dữ liệu công khai:", error);
            setStatus("Không thể tải dữ liệu lúc này. Vui lòng thử lại sau.", "error");
        }
    }

    async function openChunks(item) {
        elements.dialogTitle.textContent = item.title;
        elements.dialogUrl.textContent = item.url;
        elements.dialogUrl.href = item.url;
        elements.chunkList.replaceChildren();
        elements.dialogStatus.textContent = "Đang tải các chunk…";
        elements.dialogStatus.hidden = false;
        elements.dialog.showModal();

        try {
            const response = await fetch(
                "/api/public/data/chunks?url=" + encodeURIComponent(item.url),
                { headers: { Accept: "application/json" } }
            );
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            elements.dialogStatus.hidden = true;

            if (!data.chunks.length) {
                elements.dialogStatus.textContent = "Trang này chưa có chunk trong FAISS.";
                elements.dialogStatus.hidden = false;
                return;
            }

            data.chunks.forEach(function (chunk) {
                const article = createElement("article", "chunk");
                const heading = createElement(
                    "div",
                    "chunk-heading",
                    "Chunk " + (chunk.chunk_index + 1) + " · " +
                        number.format(chunk.word_count) + " từ"
                );
                const content = createElement("p", "chunk-content", chunk.content);
                article.append(heading, content);
                elements.chunkList.appendChild(article);
            });
        } catch (error) {
            console.error("Không thể tải chunk:", error);
            elements.dialogStatus.textContent =
                "Không thể tải các chunk lúc này. Vui lòng thử lại sau.";
        }
    }

    elements.form.addEventListener("submit", function (event) {
        event.preventDefault();
        state.search = elements.search.value.trim();
        state.page = 1;
        loadData();
    });
    elements.previous.addEventListener("click", function () {
        if (state.page > 1) {
            state.page -= 1;
            loadData();
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });
    elements.next.addEventListener("click", function () {
        if (state.page < state.totalPages) {
            state.page += 1;
            loadData();
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });
    elements.closeDialog.addEventListener("click", function () {
        elements.dialog.close();
    });
    elements.dialog.addEventListener("click", function (event) {
        if (event.target === elements.dialog) elements.dialog.close();
    });

    loadData();
}());
