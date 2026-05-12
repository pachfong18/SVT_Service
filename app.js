// เพิ่มการนำเข้า deleteDoc จาก firestore
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// --- การตรวจสอบรหัสผ่าน Admin ---
window.checkAdminPassword = function() {
    const password = prompt("กรุณากรอกรหัสผ่านเพื่อเข้าสู่ระบบฝ่าย IT:");
    if (password === "SVTIT") {
        switchView('admin-view');
    } else if (password !== null) { // กรณีไม่ได้กด Cancel
        alert("รหัสผ่านไม่ถูกต้อง ไม่อนุญาตให้เข้าถึงข้อมูลฝ่าย IT");
    }
};

// --- การส่งข้อมูลแจ้งซ่อม ---
document.getElementById('report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const loading = document.getElementById('loading');
    
    btn.disabled = true;
    loading.classList.remove('hidden');

    const name = document.getElementById('reporter-name').value;
    
    // รวมข้อมูลสถานที่จาก 3 ช่อง
    const building = document.getElementById('loc-building').value;
    const floor = document.getElementById('loc-floor').value;
    const room = document.getElementById('loc-room').value;
    const locationCombined = `อาคาร: ${building} | ชั้น: ${floor} | ห้อง: ${room}`;
    
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
                location: locationCombined,
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
                body: JSON.stringify({ name, location: locationCombined, details, noImage: true })
            });
        }

        // บันทึกลง Firestore
        await addDoc(collection(db, "maintenance_requests"), {
            reporterName: name,
            location: locationCombined,
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

// --- ดึงข้อมูลลงตาราง (Real-time) - รวมโค้ดให้เหลือชุดเดียว ---
const q = query(collection(db, "maintenance_requests"), orderBy("timestamp", "desc"));
onSnapshot(q, (snapshot) => {
    const adminTbody = document.getElementById('table-body');
    const homeTbody = document.getElementById('home-table-body'); 
    
    adminTbody.innerHTML = "";
    homeTbody.innerHTML = ""; 
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

        // ส่วนของหน้า Admin
        const adminTr = document.createElement('tr');
        
        let displayImage = "-";
        if(data.imageUrl) {
            const fileId = data.imageUrl.split('id=')[1];
            if(fileId) {
                const directLink = `https://lh3.googleusercontent.com/d/$${fileId}`;
                displayImage = `<img src="${directLink}" style="width: 80px; height: 60px; object-fit: cover; border-radius: 4px; cursor: pointer;" onclick="window.open('${data.imageUrl}')">`;
            } else {
                displayImage = `<a href="${data.imageUrl}" target="_blank" style="color:var(--gold);">ดูรูปภาพ</a>`;
            }
        }

        adminTr.innerHTML = `
            <td>${timeStr}</td>
            <td>${data.reporterName}</td>
            <td>${data.location}</td>
            <td>${data.details}</td>
            <td>${displayImage}</td>
            <td><input type="text" class="assignee-input" value="${data.assignee || ''}" onchange="updateAssignee('${id}', this.value)"></td>
            <td>
                <select onchange="updateStatus('${id}', this.value)" style="background:${getStatusColor(data.status)}; color:white; border:none; border-radius:4px; padding:5px;">
                    <option value="รอรับแจ้ง" ${data.status === 'รอรับแจ้ง' ? 'selected' : ''}>รอรับแจ้ง</option>
                    <option value="กำลังดำเนินการ" ${data.status === 'กำลังดำเนินการ' ? 'selected' : ''}>กำลังดำเนินการ</option>
                    <option value="รอสั่งอุปกรณ์" ${data.status === 'รอสั่งอุปกรณ์' ? 'selected' : ''}>รอสั่งอุปกรณ์</option>
                    <option value="แจ้งซ่อมสำเร็จ" ${data.status === 'แจ้งซ่อมสำเร็จ' ? 'selected' : ''}>แจ้งซ่อมสำเร็จ</option>
                </select>
            </td>
            <td>
                <button onclick="deleteRecord('${id}')" class="btn-delete">ลบ</button>
            </td>
        `;
        adminTbody.appendChild(adminTr);
    });

    document.getElementById('queue-count').innerText = activeQueueCount;
});

// --- ฟังก์ชันช่วยเหลือการจัดการข้อมูล ---
window.updateStatus = async function(id, newStatus) {
    await updateDoc(doc(db, "maintenance_requests", id), { status: newStatus });
};

window.updateAssignee = async function(id, newAssignee) {
    await updateDoc(doc(db, "maintenance_requests", id), { assignee: newAssignee });
};

window.deleteRecord = async function(id) {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการลบรายการแจ้งซ่อมนี้? ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้")) {
        try {
            await deleteDoc(doc(db, "maintenance_requests", id));
        } catch (error) {
            console.error("Error deleting document: ", error);
            alert("เกิดข้อผิดพลาดในการลบข้อมูล");
        }
    }
};

function getStatusColor(status) {
    if(status === 'รอรับแจ้ง') return '#dc3545'; // แดง
    if(status === 'กำลังดำเนินการ') return '#007bff'; // น้ำเงิน
    if(status === 'รอสั่งอุปกรณ์') return '#ffc107'; // เหลือง
    if(status === 'แจ้งซ่อมสำเร็จ') return '#28a745'; // เขียว
    return 'gray';
}
