module.exports = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0"
 xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
 <edmx:DataServices>
  <Schema Namespace="UntypedNS"
   xmlns="http://docs.oasis-open.org/odata/ns/edm">

    <!-- Allow dynamic properties -->
    <EntityType Name="Campaign">
      <Key><PropertyRef Name="id"/></Key>
    </EntityType>

    <EntityContainer Name="Container">
      <EntitySet Name="Campaigns" EntityType="UntypedNS.Campaign"/>
    </EntityContainer>

  </Schema>
 </edmx:DataServices>
</edmx:Edmx>`;
