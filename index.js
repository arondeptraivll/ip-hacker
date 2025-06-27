<!-- file: public/index.html -->
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Công cụ tạo Link Theo dõi</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>

    <div class="container">
        <h2>Tạo liên kết theo dõi mới</h2>
        <p>Nhấn nút bên dưới để tạo một liên kết có thể theo dõi vị trí và thiết bị người nhấp chuột.</p>
        <button id="create-link-btn">Tạo liên kết ngay!</button>
        <div class="loader" id="create-loader"></div>
        <div id="result" class="result-box" style="display:none;"></div>
    </div>

    <div class="container">
        <h2>Kiểm tra kết quả theo dõi</h2>
        <p>Nhập mã bí mật của bạn để xem những ai đã nhấp vào liên kết.</p>
        <div class="form-group">
            <label for="tracking-code-input">Mã bí mật:</label>
            <input type="text" id="tracking-code-input" placeholder="Dán mã bí mật vào đây" />
        </div>
        <button id="view-results-btn">Xem kết quả</button>
        <div class="loader" id="view-loader"></div>
        <div id="results-display"></div>
    </div>

<script>
    // Giao diện không cần URL vì nó được phục vụ từ cùng một nơi với API
    const createBtn = document.getElementById('create-link-btn');
    const resultDiv = document.getElementById('result');
    const createLoader = document.getElementById('create-loader');
    
    const viewBtn = document.getElementById('view-results-btn');
    const trackingCodeInput = document.getElementById('tracking-code-input');
    const resultsDisplayDiv = document.getElementById('results-display');
    const viewLoader = document.getElementById('view-loader');
    
    // --- Chức năng tạo link ---
    createBtn.addEventListener('click', async () => {
        createBtn.disabled = true;
        createLoader.style.display = 'block';
        resultDiv.style.display = 'none';

        try {
            // API call dùng đường dẫn tương đối
            const response = await fetch('/api/links', { method: 'POST' });
            const data = await response.json();

            if (response.ok) {
                resultDiv.innerHTML = `
                    <p><b>✅ Tạo thành công!</b></p>
                    <p><b>🔗 Link để gửi đi:</b></p> 
                    <input type="text" value="${data.trackable_link}" readonly onclick="this.select()">
                    <p style="color:red; font-weight:bold;"><b>🔑 Mã bí mật (lưu lại cẩn thận):</b></p>
                    <input type="text" value="${data.tracking_code}" readonly onclick="this.select()">
                `;
            } else {
                resultDiv.innerHTML = `<p class="error">Lỗi: ${data.error || 'Không thể tạo link.'}</p>`;
            }
            resultDiv.style.display = 'block';
        } catch (error) {
            resultDiv.innerHTML = '<p class="error">Đã có lỗi mạng xảy ra. Vui lòng thử lại.</p>';
            resultDiv.style.display = 'block';
        } finally {
            createBtn.disabled = false;
            createLoader.style.display = 'none';
        }
    });
    
    // --- Chức năng xem kết quả ---
    viewBtn.addEventListener('click', async () => {
        const trackingCode = trackingCodeInput.value.trim();
        if (!trackingCode) {
            alert('Vui lòng nhập mã bí mật.');
            return;
        }

        viewBtn.disabled = true;
        viewLoader.style.display = 'block';
        resultsDisplayDiv.innerHTML = '';

        try {
            // API call dùng đường dẫn tương đối
            const response = await fetch(`/api/results/${trackingCode}`);
            const data = await response.json();

            if (response.ok) {
                if (data.length === 0) {
                    resultsDisplayDiv.innerHTML = '<p>Chưa có ai nhấp vào liên kết này.</p>';
                } else {
                    let tableHTML = `
                        <p><b>Tổng số lượt nhấp: ${data.length}</b></p>
                        <table>
                            <thead>
                                <tr>
                                    <th>Thời gian</th>
                                    <th>Địa chỉ IP</th>
                                    <th>Vị trí</th>
                                    <th>Thiết bị (User Agent)</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    data.forEach(click => {
                        const mapLink = click.latitude ? `<a href="https://www.google.com/maps?q=${click.latitude},${click.longitude}" target="_blank">Xem bản đồ</a>` : 'N/A';
                        tableHTML += `
                            <tr>
                                <td>${new Date(click.timestamp).toLocaleString('vi-VN')}</td>
                                <td>${click.ip_address}</td>
                                <td>${click.city || 'N/A'}, ${click.country || 'N/A'} (${mapLink})</td>
                                <td class="user-agent" title="${click.user_agent}">${click.user_agent}</td>
                            </tr>
                        `;
                    });
                    tableHTML += `</tbody></table>`;
                    resultsDisplayDiv.innerHTML = tableHTML;
                }
            } else {
                 resultsDisplayDiv.innerHTML = `<p class="error">Lỗi: ${data.error || 'Mã không hợp lệ hoặc có lỗi.'}</p>`;
            }
        } catch (error) {
            resultsDisplayDiv.innerHTML = '<p class="error">Đã có lỗi mạng khi kết nối. Vui lòng thử lại.</p>';
        } finally {
            viewBtn.disabled = false;
            viewLoader.style.display = 'none';
        }
    });
</script>

</body>
</html>
