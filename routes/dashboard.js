const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req, res) => {
  try {
    // 1. Total Contacts
    const contactsRes = await db.query("SELECT COUNT(*) FROM contacts");
    const totalLeads = parseInt(contactsRes.rows[0].count, 10);

    // 2. Total Contact Lists
    const listsRes = await db.query("SELECT COUNT(*) FROM contact_lists");
    const totalLists = parseInt(listsRes.rows[0].count, 10);

    // 3. Campaigns count and totals
    const campaignsRes = await db.query(`
      SELECT 
        COUNT(*) as total_campaigns,
        COALESCE(SUM(total_sent), 0) as total_sent,
        COALESCE(SUM(total_delivered), 0) as total_delivered,
        COALESCE(SUM(total_read), 0) as total_read,
        COALESCE(SUM(total_failed), 0) as total_failed
      FROM campaigns
    `);
    const c = campaignsRes.rows[0];
    const totalCampaigns = parseInt(c.total_campaigns, 10);
    let campaignsSent = parseInt(c.total_sent, 10);
    let campaignsDelivered = parseInt(c.total_delivered, 10);
    let campaignsRead = parseInt(c.total_read, 10);
    let campaignsFailed = parseInt(c.total_failed, 10);

    // 4. Message counts from messages table for more accurate stats (including non-campaign messages)
    const msgsRes = await db.query(`
      SELECT 
        direction,
        status,
        COUNT(*) as count
      FROM messages
      GROUP BY direction, status
    `);
    
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
