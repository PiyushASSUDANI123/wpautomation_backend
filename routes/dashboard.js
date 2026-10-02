const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // We can filter campaigns and messages by date if provided
    let campaignWhere = "";
    let messageWhere = "";
    const params = [];
    
    if (startDate && endDate) {
      campaignWhere = "WHERE DATE(created_at) >= $1 AND DATE(created_at) <= $2";
      messageWhere = "WHERE DATE(timestamp) >= $1 AND DATE(timestamp) <= $2";
      params.push(startDate, endDate);
    }

    // 1. Total Contacts (usually all-time, but keeping it simple)
    const contactsRes = await db.query("SELECT COUNT(*) FROM contacts");
    const totalLeads = parseInt(contactsRes.rows[0].count, 10);

    // 2. Total Contact Lists
    const listsRes = await db.query("SELECT COUNT(*) FROM contact_lists");
    const totalLists = parseInt(listsRes.rows[0].count, 10);

    // 3. Campaigns count and totals
    const campaignsRes = await db.query(`
      SELECT 
        COUNT(*) as total_campaigns,
        COALESCE(SUM(total_sent), 0) as total_sent
      FROM campaigns
      ${campaignWhere}
    `, params);
    const c = campaignsRes.rows[0];
    const totalCampaigns = parseInt(c.total_campaigns, 10);
    let campaignsSent = parseInt(c.total_sent, 10);
    let campaignsDelivered = 0;
    let campaignsRead = 0;
    let campaignsFailed = 0;

    // 4. Message counts from messages table for more accurate stats (including non-campaign messages)
    const msgsRes = await db.query(`
      SELECT 
        direction,
        status,
        COUNT(*) as count
      FROM messages
      ${messageWhere}
      GROUP BY direction, status
    `, params);
    
    let totalMessagesSent = 0;
    let totalMessagesReceived = 0;
    
    // We can also get exact delivered/read/failed from the messages table
    let exactSent = 0;
    let exactDelivered = 0;
    let exactRead = 0;
    let exactFailed = 0;

    msgsRes.rows.forEach(row => {
      const count = parseInt(row.count, 10);
      if (row.direction === 'inbound') {
        totalMessagesReceived += count;
      } else {
        totalMessagesSent += count;
        if (row.status === 'sent') exactSent += count;
        else if (row.status === 'delivered') exactDelivered += count;
        else if (row.status === 'read') exactRead += count;
        else if (row.status === 'failed') exactFailed += count;
      }
    });

    // Delivered includes Read; Sent includes all.
    // If exactSent from messages table is higher than campaigns sum, use it.
    let finalSent = Math.max(campaignsSent, totalMessagesSent);
    let finalDelivered = Math.max(campaignsDelivered, exactDelivered) + Math.max(campaignsRead, exactRead);
    let finalRead = Math.max(campaignsRead, exactRead);
    let finalFailed = Math.max(campaignsFailed, exactFailed);

    let deliveryRate = "0.0";
    if (finalSent > 0) {
      deliveryRate = ((finalDelivered / finalSent) * 100).toFixed(1);
    }

    res.json({
      totalLeads,             // Total Contacts
      totalLists,             // Total Contact Lists
      totalCampaigns,
      totalMessagesSent: finalSent,
      totalMessagesReceived,
      deliveryRate,
      campaignStatus: {
        sent: finalSent,
        delivered: finalDelivered,
        read: finalRead,
        failed: finalFailed
      }
    });

  } catch (err) {
    console.error("❌ Dashboard stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
