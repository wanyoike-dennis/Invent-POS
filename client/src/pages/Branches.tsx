import { useEffect, useState } from "react";
import { Building2, MapPin, Pencil, Plus, RefreshCw, X } from "lucide-react";

type Branch = {
  id: number; name: string; code: string | null; phone: string | null;
  email: string | null; address: string | null; is_active: number;
};
type Usage = { active: number; limit: number | null; remaining: number | null; atLimit: boolean };
type Form = { name: string; code: string; phone: string; email: string; address: string };
const emptyForm: Form = { name: "", code: "", phone: "", email: "", address: "" };

function Branches() {
  const token = localStorage.getItem("token");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [usage, setUsage] = useState<Usage>({ active: 0, limit: null, remaining: null, atLimit: true });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/branches", { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "Failed to load branches");
      setBranches(d.branches || []); setUsage(d.usage); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load branches"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(""); setModal(true); };
  const openEdit = (b: Branch) => {
    setEditing(b); setForm({ name:b.name, code:b.code||"", phone:b.phone||"", email:b.email||"", address:b.address||"" });
    setError(""); setModal(true);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!token || !form.name.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const r = await fetch(editing ? `/api/branches/${editing.id}` : "/api/branches", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const d=await r.json(); if(!r.ok) throw new Error(d.message||"Failed to save branch");
      setMessage(d.message); setModal(false); setEditing(null); setForm(emptyForm); await load();
    } catch(e){ setError(e instanceof Error ? e.message : "Failed to save branch"); }
    finally{ setBusy(false); }
  };
  const toggle = async (b: Branch) => {
    if(!token) return;
    const next=b.is_active===0;
    if(!confirm(`${next?"Reactivate":"Deactivate"} ${b.name}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try{
      const r=await fetch(`/api/branches/${b.id}/status`,{
        method:"PATCH", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:JSON.stringify({is_active:next})
      });
      const d=await r.json(); if(!r.ok) throw new Error(d.message||"Failed to update branch");
      setMessage(d.message); await load();
    }catch(e){setError(e instanceof Error?e.message:"Failed to update branch");}
    finally{setBusy(false);}
  };

  if(loading) return <div className="py-20 text-center text-slate-500">Loading branches...</div>;
  const percent=usage.limit ? Math.min(100,(usage.active/usage.limit)*100):0;

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#246BFD]">Organization</p>
        <h1 className="mt-2 text-3xl font-bold text-[#071827]">Branch Management</h1>
        <p className="mt-2 text-sm text-slate-500">Manage business locations and subscription capacity.</p></div>
      <button onClick={openCreate} disabled={usage.atLimit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#246BFD] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"><Plus size={18}/>Add Branch</button>
    </div>

    {message&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}
    {error&&!modal&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

    <div className="grid gap-4 md:grid-cols-3">
      {[["Active Branches",usage.active],["Plan Limit",usage.limit??"—"],["Remaining",usage.remaining??"—"]].map(([label,value])=>
        <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-3xl font-bold text-[#071827]">{value}</p></div>)}
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex justify-between gap-3"><div><p className="font-semibold text-[#071827]">Subscription Capacity</p><p className="mt-1 text-sm text-slate-500">{usage.limit===null?"Branch limit is not configured.":`${usage.active} of ${usage.limit} active branches used`}</p></div>
      <span className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ${usage.atLimit?"bg-amber-100 text-amber-800":"bg-emerald-100 text-emerald-700"}`}>{usage.atLimit?"Capacity reached":`${usage.remaining} remaining`}</span></div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#246BFD]" style={{width:`${percent}%`}}/></div>
    </div>

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5"><h2 className="font-semibold text-[#071827]">Business Branches</h2></div>
      {branches.map(b=><div key={b.id} className="flex flex-col gap-4 border-b border-slate-100 p-5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3"><div className="rounded-xl bg-[#246BFD]/10 p-3 text-[#246BFD]"><Building2 size={20}/></div>
          <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[#071827]">{b.name}</p>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${b.is_active?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-500"}`}>{b.is_active?"Active":"Inactive"}</span>
            {b.code&&<span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{b.code}</span>}</div>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><MapPin size={14}/>{b.address||"No address"}</p></div></div>
        <div className="flex gap-2"><button onClick={()=>openEdit(b)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><Pencil size={15}/>Edit</button>
          <button disabled={busy} onClick={()=>toggle(b)} className={`rounded-xl px-3 py-2 text-sm font-semibold ${b.is_active?"bg-red-50 text-red-700":"bg-emerald-50 text-emerald-700"}`}>{b.is_active?"Deactivate":"Reactivate"}</button></div>
      </div>)}
    </div>

    {modal&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071827]/60 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-5"><h2 className="text-xl font-bold text-[#071827]">{editing?"Edit Branch":"Add Branch"}</h2><button onClick={()=>setModal(false)}><X size={20}/></button></div>
        <form onSubmit={save}><div className="grid gap-4 p-5 sm:grid-cols-2">
          {error&&<div className="sm:col-span-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {(["name","code","phone","email","address"] as const).map(k=><label key={k} className={k==="name"||k==="address"?"sm:col-span-2":""}><span className="mb-1 block text-sm font-medium capitalize text-slate-700">{k}{k==="name"?" *":""}</span><input required={k==="name"} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#246BFD]"/></label>)}
        </div><div className="flex justify-end gap-3 border-t bg-slate-50 p-4"><button type="button" onClick={()=>setModal(false)} className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#246BFD] px-4 py-2.5 text-sm font-semibold text-white">{busy&&<RefreshCw size={15} className="animate-spin"/>}{editing?"Save Changes":"Create Branch"}</button></div></form>
      </div></div>}
  </div>;
}
export default Branches;
