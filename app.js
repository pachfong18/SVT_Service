import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAmJP_wzYRAR6VnPDPtDMUBURFThphlWvo",
  authDomain: "svt-service.firebaseapp.com",
  projectId: "svt-service",
  storageBucket: "svt-service.firebasestorage.app",
  messagingSenderId: "178012619058",
  appId: "1:178012619058:web:5660d4db834188cf9e172b",
  measurementId: "G-Z6CEY0RED2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// วางลิงก์ GAS ของคุณตรงนี้
const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzegXJFsK9xfZVBfUQxYNMsfEdEWTgs511uOFN45yVq2f7Hu3aoxikB/exec";

// ระบบสลับหน้า + เช็ครหัสผ่าน
window.switchView = function(viewId) {
    if (viewId === 'admin-view') {
        const password = prompt("กรุณากรอกรหัสผ่านฝ่าย IT:");
        if (password !== "SVTIT") {
            alert("รหัสผ่านไม่ถูกต้อง!");
            return;
        }
    }
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
};

// ส่งข้อมูล
document.getElementById('report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const loading = document.getElementById('loading');
    
    btn.disabled = true;
    loading.classList.remove('hidden');

    const name = document.getElementById('reporter-name').value;
    const building = document.getElementById('building').value;
    const floor = document.getElementById('floor').value;
    const room = document.getElementById('room').value;
    const fullLoc = `อาคาร ${building} ชั้น ${floor} ห้อง ${room}`;
    const details = document.getElementById('details').value;
    const fileInput = document.getElementById('image-file');
    
    let imageUrl = "";
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const base64 = await toBase64(file);
        const res = await fetch(GAS_WEBHOOK_URL, {
            method: "POST",
            body: JSON.stringify({
                name: name, location: fullLoc, details: details,
                base64: base64.split(',')[1], mimeType: file.type, filename: file.name
            })
        });
        const json = await res.json();
        imageUrl = json.url;
    } else {
        fetch(GAS_WEBHOOK_URL, {
            method: "POST",
            body: JSON.stringify({ name, location: fullLoc, details, noImage: true })
        });
    }

    await addDoc(collection(db, "maintenance_requests"), {
        reporterName: name, location: fullLoc, details,
        imageUrl, status: "รอรับแจ้ง", assignee: "", timestamp: serverTimestamp()
    });

    alert("แจ้งซ่อมสำเร็จ!");
    location.reload();
});

// ดึงข้อมูลแสดงผล
const q = query(collection(db, "maintenance_requests"), orderBy("timestamp", "desc"));
onSnapshot(q, (snapshot) => {
    const adminTbody = document.getElementById('table-body');
    const homeTbody = document.getElementById('home-table-body');
    adminTbody.innerHTML = ""; homeTbody.innerHTML = "";
    let count = 0;

    snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;
        const time = d.timestamp ? d.timestamp.toDate().toLocaleString('th-TH') : "...";

        if(d.status !== "แจ้งซ่อมสำเร็จ") {
            count++;
            homeTbody.innerHTML += `<tr><td>${time}</td><td>${d.reporterName}</td><td>${d.location}</td><td>${d.details}</td><td>${d.status}</td></tr>`;
        }

        let imgHtml = d.imageUrl ? `<img src="${d.imageUrl.replace('open?', 'uc?export=view&')}" style="width:50px; cursor:pointer;" onclick="window.open('${d.imageUrl}')">` : "-";

        adminTbody.innerHTML += `
            <tr>
                <td>${time}</td>
                <td>${d.reporterName}</td>
                <td>${d.location}</td>
                <td>${d.details}</td>
                <td>${imgHtml}</td>
                <td><input type="text" value="${d.assignee||''}" onchange="updateAssignee('${id}', this.value)"></td>
                <td>
                    <select onchange="updateStatus('${id}', this.value)">
                        <option value="รอรับแจ้ง" ${d.status==='รอรับแจ้ง'?'selected':''}>รอรับแจ้ง</option>
                        <option value="กำลังดำเนินการ" ${d.status==='กำลังดำเนินการ'?'selected':''}>กำลังดำเนินการ</option>
                        <option value="แจ้งซ่อมสำเร็จ" ${d.status==='แจ้งซ่อมสำเร็จ'?'selected':''}>แจ้งซ่อมสำเร็จ</option>
                    </select>
                </td>
                <td><button onclick="deleteReq('${id}')" style="background:red; color:white; border:none; padding:5px; border-radius:4px;">ลบ</button></td>
            </tr>`;
    });
    document.getElementById('queue-count').innerText = count;
});

window.updateStatus = (id, s) => updateDoc(doc(db, "maintenance_requests", id), {status: s});
window.updateAssignee = (id, a) => updateDoc(doc(db, "maintenance_requests", id), {assignee: a});
window.deleteReq = (id) => confirm("ลบข้อมูลนี้?") && deleteDoc(doc(db, "maintenance_requests", id));
const toBase64 = file => new Promise((res, rej) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = () => res(reader.result); reader.onerror = rej;
});
