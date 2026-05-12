import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. ใส่ Config ของ Firebase (เอามาจาก Firebase Console)
const firebaseConfig = {
  apiKey: "AIzaSyAmJP_wzYRAR6VnPDPtDMUBURFThphlWvo",
  authDomain: "svt-service.firebaseapp.com",
  projectId: "svt-service",
  storageBucket: "svt-service.firebasestorage.app",
  messagingSenderId: "178012619058",
  appId: "1:178012619058:web:5660d4db834188cf9e172b",
  measurementId: "G-Z6CEY0RED2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 2. ตั้งค่า Webhook URL จาก Google Apps Script
const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzegXJFsK9xfZVBfUQxYNMsfEdEWTgs511uOFN45yVq2f7Hu3aoxikB0QMr4jJQqd4q/exec"; 

// --- การเปลี่ยนหน้า (Routing) ---
window.switchView = function(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
};

// --- การส่งข้อมูลแจ้งซ่อม ---
document.getElementById('report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const loading = document.getElementById('loading');
    
    btn.disabled = true;
    loading.classList.remove('hidden');

    const name = document.getElementById('reporter-name').value;
    const location = document.getElementById('location').value;
    const details = document.getElementById('details').value;
    const fileInput = document.getElementById('image-file');
    
    let imageUrl = "";

    try {
        // หากมีรูปภาพ ให้ส่งไปที่ GAS ก่อน
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const base64 = await getBase64(file);
            
            const payload = {
                filename: file.name,
                mimeType: file.type,
                base64: base64.split('base64,')[1],
                name: name,
                location: location,
                details: details
            };

            const response = await fetch(GAS_WEBHOOK_URL, {
                method: "POST",
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if(result.url) imageUrl = result.url;
        } else {
            // ถ่ายิงแจ้งเตือนผ่าน GAS แบบไม่มีรูป
            fetch(GAS_WEBHOOK_URL, {
                method: "POST",
                body: JSON.stringify({ name, location, details, noImage: true })
            });
        }

        // บันทึกลง Firestore
        await addDoc(collection(db, "maintenance_requests"), {
            reporterName: name,
            location: location,
            details: details,
            imageUrl: imageUrl,
            status: "รอรับแจ้ง",
            assignee: "",
            timestamp: serverTimestamp()
        });

        alert("แจ้งซ่อมสำเร็จ!");
        document.getElementById('report-form').reset();
        switchView('home-view');
        
    } catch (error) {
        console.error("Error:", error);
        alert("เกิดข้อผิดพลาดในการส่งข้อมูล");
    } finally {
        btn.disabled = false;
        loading.classList.add('hidden');
    }
});

// แปลงไฟล์เป็น Base64
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// --- ดึงข้อมูลลงตาราง Admin (Real-time) ---
const q = query(collection(db, "maintenance_requests"), orderBy("timestamp", "desc"));
onSnapshot(q, (snapshot) => {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = "";
    let activeQueueCount = 0;

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;
        const timeStr = data.timestamp ? data.timestamp.toDate().toLocaleString('th-TH') : "กำลังบันทึก...";
        
        if(data.status !== "แจ้งซ่อมสำเร็จ") activeQueueCount++;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${timeStr}</td>
            <td>${data.reporterName}</td>
            <td>${data.location}</td>
            <td>${data.details}</td>
            <td>${data.imageUrl ? `<a href="${data.imageUrl}" target="_blank" style="color:var(--gold);">ดูรูปภาพ</a>` : "-"}</td>
            <td>
                <input type="text" class="assignee-input" value="${data.assignee}" placeholder="ระบุผู้รับผิดชอบ" 
                    onchange="updateAssignee('${id}', this.value)">
            </td>
            <td>
                <select onchange="updateStatus('${id}', this.value)" style="
                    background-color: ${getStatusColor(data.status)}; color: white; border: none;">
                    <option value="รอรับแจ้ง" ${data.status === 'รอรับแจ้ง' ? 'selected' : ''}>รอรับแจ้ง</option>
                    <option value="กำลังดำเนินการ" ${data.status === 'กำลังดำเนินการ' ? 'selected' : ''}>กำลังดำเนินการ</option>
                    <option value="รอสั่งอุปกรณ์" ${data.status === 'รอสั่งอุปกรณ์' ? 'selected' : ''}>รอสั่งอุปกรณ์</option>
                    <option value="แจ้งซ่อมสำเร็จ" ${data.status === 'แจ้งซ่อมสำเร็จ' ? 'selected' : ''}>แจ้งซ่อมสำเร็จ</option>
                </select>
            </td>
        `;
        tbody.appendChild(tr);
    });
// --- เพิ่มส่วนนี้ต่อจาก onSnapshot เดิมที่มีอยู่ (หรือรวมกันก็ได้) ---

onSnapshot(q, (snapshot) => {
    const adminTbody = document.getElementById('table-body');
    const homeTbody = document.getElementById('home-table-body'); // ตารางหน้าแรก
    
    adminTbody.innerHTML = "";
    homeTbody.innerHTML = ""; // ล้างข้อมูลเก่าหน้าแรก
    let activeQueueCount = 0;

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;
        const timeStr = data.timestamp ? data.timestamp.toDate().toLocaleString('th-TH') : "รอระบบ...";
        
        // กรองเฉพาะงานที่ยังไม่เสร็จเพื่อโชว์หน้าแรก
        if(data.status !== "แจ้งซ่อมสำเร็จ") {
            activeQueueCount++;
            
            const homeTr = document.createElement('tr');
            homeTr.innerHTML = `
                <td>${timeStr}</td>
                <td>${data.reporterName}</td>
                <td>${data.location}</td>
                <td>${data.details}</td>
                <td><span class="status-pill" style="background:${getStatusColor(data.status)}">${data.status}</span></td>
            `;
            homeTbody.appendChild(homeTr);
        }

        // ส่วนของหน้า Admin (ปรับให้โชว์รูป)
        const adminTr = document.createElement('tr');
        // เปลี่ยนลิงก์ Drive ให้เป็นรูปแบบที่แสดงผลในเว็บได้
        let displayImage = "-";
        if(data.imageUrl) {
            const fileId = data.imageUrl.split('id=')[1];
            // ใช้ URL นี้เพื่อให้แสดงภาพใน <img> tag ได้
            const directLink = `https://lh3.googleusercontent.com/d/${fileId}`;
            displayImage = `<img src="${directLink}" style="width: 80px; height: 60px; object-fit: cover; border-radius: 4px; cursor: pointer;" onclick="window.open('${data.imageUrl}')">`;
        }

        adminTr.innerHTML = `
            <td>${timeStr}</td>
            <td>${data.reporterName}</td>
            <td>${data.location}</td>
            <td>${data.details}</td>
            <td>${displayImage}</td>
            <td><input type="text" class="assignee-input" value="${data.assignee || ''}" onchange="updateAssignee('${id}', this.value)"></td>
            <td>
                <select onchange="updateStatus('${id}', this.value)" style="background:${getStatusColor(data.status)}; color:white; border:none; border-radius:4px;">
                    <option value="รอรับแจ้ง" ${data.status === 'รอรับแจ้ง' ? 'selected' : ''}>รอรับแจ้ง</option>
                    <option value="กำลังดำเนินการ" ${data.status === 'กำลังดำเนินการ' ? 'selected' : ''}>กำลังดำเนินการ</option>
                    <option value="รอสั่งอุปกรณ์" ${data.status === 'รอสั่งอุปกรณ์' ? 'selected' : ''}>รอสั่งอุปกรณ์</option>
                    <option value="แจ้งซ่อมสำเร็จ" ${data.status === 'แจ้งซ่อมสำเร็จ' ? 'selected' : ''}>แจ้งซ่อมสำเร็จ</option>
                </select>
            </td>
        `;
        adminTbody.appendChild(adminTr);
    });

    document.getElementById('queue-count').innerText = activeQueueCount;
});
    document.getElementById('queue-count').innerText = activeQueueCount;
});

// ฟังก์ชันช่วยเหลือตาราง Admin
window.updateStatus = async function(id, newStatus) {
    await updateDoc(doc(db, "maintenance_requests", id), { status: newStatus });
};

window.updateAssignee = async function(id, newAssignee) {
    await updateDoc(doc(db, "maintenance_requests", id), { assignee: newAssignee });
};

function getStatusColor(status) {
    if(status === 'รอรับแจ้ง') return '#dc3545'; // แดง
    if(status === 'กำลังดำเนินการ') return '#007bff'; // น้ำเงิน
    if(status === 'รอสั่งอุปกรณ์') return '#ffc107'; // เหลือง (ตัวอักษรอาจต้องเข้ม)
    if(status === 'แจ้งซ่อมสำเร็จ') return '#28a745'; // เขียว
    return 'gray';
}
